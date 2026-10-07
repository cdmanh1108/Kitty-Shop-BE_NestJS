import { assertInventoryRentable } from './rental-inventory';
import type { RentalOutboxEvent } from '../domain/rental.events';
import {
  completeRentalCreationClaim,
  lockRentalCreationClaim,
} from './rental-creation-idempotency';
import {
  ALLOCATION_STATUS,
  RENTAL_ITEM_STATUS,
  RENTAL_STATUS,
} from '@modules/rentals/domain/rental-status';

import { DEPOSIT_STATUS, ORDER_PAYMENT_STATUS } from '@modules/finance/public/payment-status';

import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import type { Prisma } from '@prisma/client';
import { RentalOverlapError } from '../domain/rental-errors';
import type {
  CreateRentalOrderData,
  RentalCreationRepository,
} from '../domain/ports/rental-creation.port';
import { getWithTx } from './rental-admin.queries';
import { isOverlapError } from './rental-errors';
import type { RentalPolicy } from '@modules/settings/public/rental-policy';
import { RentalInventoryUnavailableError, RentalInvariantError } from '../domain/rental-errors';
import { storefrontProductEligibility } from '@modules/catalog/public/storefront-eligibility';
import { createRentalDeliveryJob } from '@modules/deliveries/public/rental-delivery-transaction';
import { calculateRentalDurationDays } from '../domain/rental-policy';
import {
  assertOnlineRentalDuration,
  sumRentalPricingAmounts,
} from '../domain/rental-cycle-pricing';
import {
  assertRentalPricingLineSnapshot,
  rentalBillableQuantity,
} from '../domain/rental-pricing-snapshot';
import { RENTAL_ORDER_SOURCE } from '../domain/rental-order-source';
import { RENTAL_PRICING_VERSION } from '../domain/rental-pricing-version';
import { assertFreeAccessoryAllowed, rentalBillingRole } from '../domain/rental-accessories';

export async function createOrder(
  prisma: PrismaService,
  data: CreateRentalOrderData,
  policy: RentalPolicy,
): ReturnType<RentalCreationRepository['createOrder']> {
  const durationDays = calculateRentalDurationDays(data.rentalStartAt, data.rentalEndAt);
  if (data.source === RENTAL_ORDER_SOURCE.ONLINE) {
    assertOnlineRentalDuration(durationDays, policy.rentalPricing);
  }
  const collateral = data.collateral ?? { method: 'CASH' as const };
  if (data.collateral && !policy.deposit.allowedMethods.includes(collateral.method))
    throw new RentalInvariantError(
      'COLLATERAL_METHOD_NOT_ALLOWED',
      'Phương thức đặt cọc không được chính sách cửa hàng cho phép.',
    );
  if (collateral.method === 'DOCUMENT') {
    if (
      !collateral.documentType ||
      !policy.deposit.allowedDocumentTypes.includes(collateral.documentType)
    )
      throw new RentalInvariantError(
        'COLLATERAL_DOCUMENT_TYPE_NOT_ALLOWED',
        'Loại giấy tờ đặt cọc không được chính sách cửa hàng cho phép.',
      );
  } else if (collateral.documentType) {
    throw new RentalInvariantError(
      'COLLATERAL_DOCUMENT_TYPE_NOT_ALLOWED',
      'Đặt cọc bằng tiền mặt không được chỉ định loại giấy tờ.',
    );
  }
  try {
    return await serializableTransaction(prisma, async (tx) => {
      if (data.idempotency) await lockRentalCreationClaim(tx, data.shopId, data.idempotency);

      assertAllocationPlan(data);
      const billableQuantity = rentalBillableQuantity(data.lines);
      for (const line of data.lines)
        assertRentalPricingLineSnapshot(line, durationDays, billableQuantity);
      const accessoryEligibility = await assertRentalCatalogLines(tx, data);

      for (const line of data.lines) {
        await assertInventoryRentable(tx, {
          shopId: data.shopId,
          inventoryIds: line.inventory.map((item) => item.id),
          variantId: line.variantId,
        });
      }

      const rentalSubtotal = sumRentalPricingAmounts(data.lines.map((line) => line.lineTotal));
      const explicitChargesTotal = data.charges.reduce(
        (sum, charge) => sum + charge.amount * charge.quantity,
        0,
      );
      const shippingTotal = data.delivery?.shippingFee ?? 0;
      const chargesTotal = explicitChargesTotal + shippingTotal;
      const depositRequired = sumRentalPricingAmounts(data.lines.map((line) => line.depositAmount));
      const grandTotal = Math.max(0, rentalSubtotal + chargesTotal - data.discountTotal);

      const order = await tx.rentalOrder.create({
        data: {
          shopId: data.shopId,
          orderNumber: data.orderNumber,
          customerId: data.customerId,
          source: data.source,
          webAccountId: data.webAccountId ?? null,
          notificationEmail:
            data.source === RENTAL_ORDER_SOURCE.ONLINE ? (data.notificationEmail ?? null) : null,
          locationId: data.locationId,
          rentalStartAt: data.rentalStartAt,
          rentalEndAt: data.rentalEndAt,
          status: RENTAL_STATUS.RESERVED,
          paymentStatus: grandTotal === 0 ? ORDER_PAYMENT_STATUS.PAID : ORDER_PAYMENT_STATUS.UNPAID,
          preferredPaymentMethod: data.preferredPaymentMethod,
          depositStatus:
            depositRequired === 0 ? DEPOSIT_STATUS.NOT_REQUIRED : DEPOSIT_STATUS.PENDING,
          rentalSubtotal,
          chargesTotal,
          discountTotal: data.discountTotal,
          depositRequired,
          collateralMethod: data.collateral?.method ?? 'CASH',
          documentType: data.collateral?.documentType,
          grandTotal,
          note: data.note,
          internalNote: data.internalNote,
          createdBy: data.createdBy,
          updatedBy: data.createdBy,
        },
      });

      for (const line of data.lines) {
        const snapshot = line.pricingSnapshot;
        const allowFreeAccessorySnapshot = accessoryEligibility.get(line.variantId);
        if (allowFreeAccessorySnapshot === undefined) throw new RentalInventoryUnavailableError();
        const pricingSnapshot =
          snapshot.version === RENTAL_PRICING_VERSION.CYCLE
            ? { ...snapshot, policy: { ...snapshot.policy } }
            : { ...snapshot };
        const orderItem = await tx.rentalOrderItem.create({
          data: {
            shopId: data.shopId,
            orderId: order.id,
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            billingRole: rentalBillingRole(line.billingRole),
            allowFreeAccessorySnapshot,
            rentalStartAt: data.rentalStartAt,
            rentalEndAt: data.rentalEndAt,
            productNameSnapshot: line.productName,
            variantNameSnapshot: line.variantName,
            skuSnapshot: line.quantity === 1 ? line.inventory[0]?.sku : undefined,
            unitRentalPrice: line.unitRentalPrice,
            depositAmount: line.depositAmount,
            lineTotal: line.lineTotal,
            pricingSnapshot,
            status: RENTAL_ITEM_STATUS.RESERVED,
          },
        });

        for (const inventory of line.inventory) {
          await tx.rentalItemAllocation.create({
            data: {
              shopId: data.shopId,
              orderId: order.id,
              orderItemId: orderItem.id,
              inventoryItemId: inventory.id,
              reservedFrom: data.rentalStartAt,
              reservedUntil: data.rentalEndAt,
              status: ALLOCATION_STATUS.HELD,
              createdBy: data.createdBy,
            },
          });
        }
      }

      if (data.charges.length > 0) {
        await tx.rentalOrderCharge.createMany({
          data: data.charges.map((charge) => ({
            shopId: data.shopId,
            orderId: order.id,
            chargeType: charge.chargeType,
            description: charge.description,
            amount: charge.amount,
            quantity: charge.quantity,
            createdBy: data.createdBy,
          })),
        });
      }

      if (data.delivery) {
        await createRentalDeliveryJob(tx, {
          shopId: data.shopId,
          orderId: order.id,
          ...data.delivery,
          createdBy: data.createdBy,
        });
        if (data.delivery.shippingFee > 0) {
          await tx.rentalOrderCharge.create({
            data: {
              shopId: data.shopId,
              orderId: order.id,
              chargeType: 'SHIPPING',
              description: 'Shipping fee',
              amount: data.delivery.shippingFee,
              quantity: 1,
              createdBy: data.createdBy,
            },
          });
        }
      }

      await tx.rentalOrderStatusHistory.create({
        data: {
          shopId: data.shopId,
          orderId: order.id,
          toStatus: RENTAL_STATUS.RESERVED,
          changedBy: data.createdBy,
        },
      });
      await tx.outboxEvent.create({
        data: {
          shopId: data.shopId,
          eventType: 'RENTAL_ORDER_CREATED',
          aggregateType: 'rental_order',
          aggregateId: order.id,
          payload: { orderId: order.id },
        } satisfies RentalOutboxEvent,
      });
      const result = await getWithTx(tx, data.shopId, order.id);
      if (data.idempotency) {
        await completeRentalCreationClaim(tx, data.shopId, data.idempotency, result);
      }
      return result;
    });
  } catch (error) {
    if (isOverlapError(error)) throw new RentalOverlapError();
    throw error;
  }
}

async function assertRentalCatalogLines(
  tx: Prisma.TransactionClient,
  data: CreateRentalOrderData,
): Promise<Map<string, boolean>> {
  // Revalidate Catalog-owned eligibility in the serializable booking transaction
  // so stale storefront selections cannot create a Rental allocation.
  const expectedProductByVariant = new Map<string, string>();
  for (const line of data.lines) {
    const existingProductId = expectedProductByVariant.get(line.variantId);
    if (existingProductId && existingProductId !== line.productId) {
      throw new RentalInventoryUnavailableError();
    }
    expectedProductByVariant.set(line.variantId, line.productId);
  }

  const eligibleVariants = await tx.productVariant.findMany({
    where: {
      id: { in: [...expectedProductByVariant.keys()] },
      shopId: data.shopId,
      status: 'ACTIVE',
      archivedAt: null,
      product: {
        shopId: data.shopId,
        ...(data.storefrontEligibility ? storefrontProductEligibility : {}),
      },
    },
    select: { id: true, productId: true, product: { select: { allowFreeAccessory: true } } },
  });
  if (
    eligibleVariants.length !== expectedProductByVariant.size ||
    eligibleVariants.some(
      (variant) => expectedProductByVariant.get(variant.id) !== variant.productId,
    )
  ) {
    throw new RentalInventoryUnavailableError();
  }
  const accessoryEligibility = new Map<string, boolean>();
  for (const variant of eligibleVariants) {
    accessoryEligibility.set(variant.id, variant.product.allowFreeAccessory);
  }
  for (const line of data.lines) {
    const allowed = accessoryEligibility.get(line.variantId);
    if (allowed === undefined) throw new RentalInventoryUnavailableError();
    assertFreeAccessoryAllowed(rentalBillingRole(line.billingRole), allowed);
  }
  return accessoryEligibility;
}

/**
 * Every physical inventory item may be allocated only once per order.  This
 * protects the persistence boundary even if a caller skips the Web basket
 * normalizer or retries a stale selection plan.
 */
function assertAllocationPlan(data: CreateRentalOrderData): void {
  const allocatedInventoryIds = new Set<string>();

  for (const line of data.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new RentalInventoryUnavailableError();
    }
    if (line.inventory.length !== line.quantity) {
      throw new RentalInventoryUnavailableError();
    }
    for (const inventory of line.inventory) {
      if (allocatedInventoryIds.has(inventory.id)) {
        throw new RentalInventoryUnavailableError();
      }
      allocatedInventoryIds.add(inventory.id);
    }
  }
}
