import { assertWholeVnd, PaymentUnavailableError } from '@modules/payments/public/hosted-payment';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { RentalProductPriceChangedError } from '../domain/rental-errors';
import { readRentalPolicyInTransaction } from '@modules/settings/public/rental-policy-transaction';
import { assertRentalQuoteAmounts } from '../domain/rental-quote';
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
import { RentalInventoryUnavailableError } from '../domain/rental-errors';
import { storefrontProductEligibility } from '@modules/catalog/public/storefront-eligibility';
import { createRentalDeliveryJob } from '@modules/deliveries/public/rental-delivery-transaction';
import { calculateRentalDurationDays } from '../domain/rental-policy';
import {
  assertOnlineRentalDuration,
  rentalQuoteTotal,
  sumRentalPricingAmounts,
} from '../domain/rental-cycle-pricing';
import {
  assertRentalPricingLineSnapshot,
  rentalBillableQuantity,
  resolveRentalLinePricing,
} from '../domain/rental-pricing-snapshot';
import { RENTAL_ORDER_SOURCE } from '../domain/rental-order-source';
import { RENTAL_PRICING_VERSION } from '../domain/rental-pricing-version';
import {
  assertFreeAccessoryAllowed,
  rentalAccessoryAllowance,
  rentalBillingRole,
} from '../domain/rental-accessories';
import { RentalAuthenticationRequiredError } from '../application/rental.errors';
import { redeemWebAccountLoyaltyReward } from '@modules/customers/public/rental-loyalty-transaction';
import {
  RentalLoyaltyRewardNotApplicableError,
  RentalLoyaltyRewardUnavailableError,
} from '../domain/rental-errors';

export async function createOrder(
  prisma: PrismaService,
  data: CreateRentalOrderData,
  policy: RentalPolicy,
): ReturnType<RentalCreationRepository['createOrder']> {
  const durationDays = calculateRentalDurationDays(data.rentalStartAt, data.rentalEndAt);
  if (data.source === RENTAL_ORDER_SOURCE.ONLINE) {
    assertOnlineRentalDuration(durationDays, policy.rentalPricing);
  }
  try {
    return await serializableTransaction(prisma, async (tx) => {
      if (data.idempotency) await lockRentalCreationClaim(tx, data.shopId, data.idempotency);

      const checkoutAccount =
        data.source === RENTAL_ORDER_SOURCE.ONLINE && data.webAccountId
          ? await tx.webAccount.findFirst({
              where: {
                id: data.webAccountId,
                disabledAt: null,
                emailVerifiedAt: { not: null },
              },
              select: { email: true },
            })
          : null;
      if (data.source === RENTAL_ORDER_SOURCE.ONLINE && !checkoutAccount?.email)
        throw new RentalAuthenticationRequiredError();

      const rewardToRedeem = data.loyaltyRewardId
        ? data.source === RENTAL_ORDER_SOURCE.ONLINE && data.webAccountId
          ? await tx.customerLoyaltyReward.findFirst({
              where: {
                id: data.loyaltyRewardId,
                shopId: data.shopId,
                ownerType: 'WEB_ACCOUNT',
                webAccountId: data.webAccountId,
                status: 'AVAILABLE',
              },
              select: { rewardValue: true },
            })
          : null
        : null;
      if (data.loyaltyRewardId && !rewardToRedeem) throw new RentalLoyaltyRewardUnavailableError();

      assertAllocationPlan(data);
      const billableQuantity = rentalBillableQuantity(data.lines);
      for (const line of data.lines)
        assertRentalPricingLineSnapshot(line, durationDays, billableQuantity);
      const checkoutPolicy = data.expectedQuote
        ? await readRentalPolicyInTransaction(tx, data.shopId)
        : null;
      if (checkoutPolicy) assertOnlineRentalDuration(durationDays, checkoutPolicy.rentalPricing);
      const { accessoryEligibility, lines } = await resolveBookingLines(
        tx,
        data,
        durationDays,
        checkoutPolicy,
      );

      for (const line of data.lines) {
        await assertInventoryRentable(tx, {
          shopId: data.shopId,
          inventoryIds: line.inventory.map((item) => item.id),
          variantId: line.variantId,
        });
      }

      const rentalSubtotal = sumRentalPricingAmounts(lines.map((line) => line.lineTotal));
      const explicitChargesTotal = data.charges.reduce(
        (sum, charge) => sum + charge.amount * charge.quantity,
        0,
      );
      const shippingTotal = checkoutPolicy
        ? data.delivery?.method === 'DELIVERY'
          ? checkoutPolicy.delivery.standardShippingFee
          : 0
        : (data.delivery?.shippingFee ?? 0);
      const chargesTotal = explicitChargesTotal + shippingTotal;
      const depositRequired = sumRentalPricingAmounts(lines.map((line) => line.depositAmount));
      if (rewardToRedeem && rentalSubtotal <= 0) throw new RentalLoyaltyRewardNotApplicableError();
      const discountTotal = rewardToRedeem
        ? Math.min(rewardToRedeem.rewardValue.toNumber(), rentalSubtotal)
        : data.discountTotal;
      const grandTotal = data.expectedQuote
        ? rentalQuoteTotal(rentalSubtotal, chargesTotal, discountTotal)
        : Math.max(0, rentalSubtotal + chargesTotal - discountTotal);
      if (data.expectedQuote) {
        assertRentalQuoteAmounts(data.expectedQuote, {
          rentalSubtotal,
          shippingFee: shippingTotal,
          discountAmount: discountTotal,
          depositAmount: depositRequired,
          totalAmount: grandTotal,
        });
      }

      const payosAmount = data.payosExpiresAt ? grandTotal + depositRequired : 0;
      if (data.payosExpiresAt) {
        assertWholeVnd(grandTotal);
        assertWholeVnd(depositRequired);
        assertWholeVnd(payosAmount);
        if (depositRequired > 100_000_000)
          throw new PaymentUnavailableError(
            'PAYOS_DEPOSIT_LIMIT',
            'Vui lòng liên hệ KITTY để thanh toán khoản cọc này.',
          );
      }
      const order = await tx.rentalOrder.create({
        data: {
          shopId: data.shopId,
          orderNumber: data.orderNumber,
          customerId: data.customerId,
          source: data.source,
          webAccountId: data.webAccountId ?? null,
          notificationEmail:
            data.source === RENTAL_ORDER_SOURCE.ONLINE ? checkoutAccount!.email : null,
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
          discountTotal,
          depositRequired,
          grandTotal,
          note: data.note,
          internalNote: data.internalNote,
          createdBy: data.createdBy,
          updatedBy: data.createdBy,
        },
      });

      if (data.payosExpiresAt && payosAmount > 0) {
        await tx.rentalPayosAttempt.create({
          data: {
            orderId: order.id,
            rentalAmount: grandTotal,
            depositAmount: depositRequired,
            expiresAt: data.payosExpiresAt,
            nextCheckAt: data.payosExpiresAt,
          },
        });
      }

      if (data.loyaltyRewardId && data.webAccountId) {
        const redeemed = await redeemWebAccountLoyaltyReward(tx, {
          shopId: data.shopId,
          webAccountId: data.webAccountId,
          rewardId: data.loyaltyRewardId,
          orderId: order.id,
          redeemedAt: data.loyaltyRewardRedeemedAt ?? new Date(),
        });
        if (!redeemed) throw new RentalLoyaltyRewardUnavailableError();
      }

      for (const line of lines) {
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
          shippingFee: shippingTotal,
          createdBy: data.createdBy,
        });
        if (shippingTotal > 0) {
          await tx.rentalOrderCharge.create({
            data: {
              shopId: data.shopId,
              orderId: order.id,
              chargeType: 'SHIPPING',
              description: 'Shipping fee',
              amount: shippingTotal,
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

async function resolveBookingLines(
  tx: Prisma.TransactionClient,
  data: CreateRentalOrderData,
  durationDays: number,
  checkoutPolicy: RentalPolicy | null,
) {
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
    select: {
      id: true,
      productId: true,
      depositAmountOverride: true,
      product: {
        select: {
          allowFreeAccessory: true,
          freeAccessoryLimit: true,
          rentalPriceOverride: true,
          defaultDepositAmount: true,
        },
      },
    },
  });
  if (
    eligibleVariants.length !== expectedProductByVariant.size ||
    eligibleVariants.some(
      (variant) => expectedProductByVariant.get(variant.id) !== variant.productId,
    )
  ) {
    throw new RentalInventoryUnavailableError();
  }
  const variants = new Map(eligibleVariants.map((variant) => [variant.id, variant]));
  const accessoryEligibility = new Map(
    eligibleVariants.map((variant) => [variant.id, variant.product.allowFreeAccessory]),
  );
  const billableQuantity = rentalBillableQuantity(data.lines);
  rentalAccessoryAllowance(
    data.lines.map((line) => ({
      ...line,
      freeAccessoryLimit: variants.get(line.variantId)!.product.freeAccessoryLimit,
    })),
  );
  const lines = data.lines.map((line) => {
    const variant = variants.get(line.variantId)!;
    const billingRole = rentalBillingRole(line.billingRole);
    assertFreeAccessoryAllowed(billingRole, variant.product.allowFreeAccessory);
    const override = variant.product.rentalPriceOverride;
    const price = override == null ? null : decimalToNumber(override);
    if (checkoutPolicy) {
      return {
        ...line,
        ...resolveRentalLinePricing({
          durationDays,
          billableQuantity,
          billingRole,
          policy: checkoutPolicy.rentalPricing,
          quantity: line.quantity,
          depositPerItem: decimalToNumber(
            variant.depositAmountOverride ?? variant.product.defaultDepositAmount,
          ),
          productCyclePriceOverride: price,
        }),
      };
    }
    const snapshot = line.pricingSnapshot;
    if (
      snapshot.version === RENTAL_PRICING_VERSION.CYCLE &&
      snapshot.itemCyclePriceOverride == null &&
      snapshot.orderCyclePriceOverride == null &&
      (snapshot.productCyclePriceOverride ?? null) !== price
    ) {
      throw new RentalProductPriceChangedError();
    }
    return line;
  });
  return { accessoryEligibility, lines };
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
