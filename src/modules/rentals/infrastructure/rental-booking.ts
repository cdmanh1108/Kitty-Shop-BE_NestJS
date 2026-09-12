import { assertInventoryRentable } from './rental-inventory';
import type { RentalOutboxEvent } from '../domain/rental.events';
import { lockRentalClaim, completeRentalClaim } from './rental-idempotency';
import {
  ALLOCATION_STATUS,
  RENTAL_ITEM_STATUS,
  RENTAL_STATUS,
} from '@modules/rentals/domain/rental-status';

import { DEPOSIT_STATUS, ORDER_PAYMENT_STATUS } from '@modules/finance/domain/payment-status';

import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import type { Prisma } from '@prisma/client';
import {
  RentalOverlapError,
  type CreateRentalOrderData,
  type RentalRepository,
} from '../domain/rental.repository';
import { getWithTx } from './rental-queries';
import { isOverlapError } from './rental-errors';
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';
import { RentalInvariantError } from '../domain/rental-errors';

export async function createOrder(
  prisma: PrismaService,
  data: CreateRentalOrderData,
  policy: RentalPolicy,
): ReturnType<RentalRepository['createOrder']> {
  const collateral = data.collateral ?? { method: 'CASH' as const };
  if (!policy.deposit.allowedMethods.includes(collateral.method))
    throw new RentalInvariantError(
      'COLLATERAL_METHOD_NOT_ALLOWED',
      'Collateral method is not allowed by shop policy',
    );
  if (collateral.method === 'DOCUMENT') {
    if (
      !collateral.documentType ||
      !policy.deposit.allowedDocumentTypes.includes(collateral.documentType)
    )
      throw new RentalInvariantError(
        'COLLATERAL_DOCUMENT_TYPE_NOT_ALLOWED',
        'Document type is not allowed by shop policy',
      );
  } else if (collateral.documentType) {
    throw new RentalInvariantError(
      'COLLATERAL_DOCUMENT_TYPE_NOT_ALLOWED',
      'Cash collateral cannot specify a document type',
    );
  }
  try {
    return await serializableTransaction(prisma, async (tx) => {
      if (data.idempotency) await lockRentalClaim(tx, data.shopId, data.idempotency);

      for (const line of data.lines) {
        await assertInventoryRentable(tx, {
          shopId: data.shopId,
          inventoryIds: line.inventory.map((item) => item.id),
          variantId: line.variantId,
        });
      }

      const rentalSubtotal = data.lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const explicitChargesTotal = data.charges.reduce(
        (sum, charge) => sum + charge.amount * charge.quantity,
        0,
      );
      const shippingTotal = data.delivery?.shippingFee ?? 0;
      const chargesTotal = explicitChargesTotal + shippingTotal;
      const depositRequired = data.lines.reduce((sum, line) => sum + line.depositAmount, 0);
      const grandTotal = Math.max(0, rentalSubtotal + chargesTotal - data.discountTotal);

      const order = await tx.rentalOrder.create({
        data: {
          shopId: data.shopId,
          orderNumber: data.orderNumber,
          customerId: data.customerId,
          locationId: data.locationId,
          rentalStartAt: data.rentalStartAt,
          rentalEndAt: data.rentalEndAt,
          status: RENTAL_STATUS.RESERVED,
          paymentStatus: grandTotal === 0 ? ORDER_PAYMENT_STATUS.PAID : ORDER_PAYMENT_STATUS.UNPAID,
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
        const orderItem = await tx.rentalOrderItem.create({
          data: {
            shopId: data.shopId,
            orderId: order.id,
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            rentalStartAt: data.rentalStartAt,
            rentalEndAt: data.rentalEndAt,
            productNameSnapshot: line.productName,
            variantNameSnapshot: line.variantName,
            skuSnapshot: line.quantity === 1 ? line.inventory[0]?.sku : undefined,
            unitRentalPrice: line.unitRentalPrice,
            depositAmount: line.depositAmount,
            lineTotal: line.lineTotal,
            pricingSnapshot: line.pricingSnapshot as Prisma.InputJsonValue,
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
        await tx.deliveryJob.create({
          data: {
            shopId: data.shopId,
            orderId: order.id,
            direction: data.delivery.direction,
            method: data.delivery.method,
            scheduledAt: data.delivery.scheduledAt,
            recipientName: data.delivery.recipientName,
            recipientPhone: data.delivery.recipientPhone,
            addressLine: data.delivery.addressLine,
            ward: data.delivery.ward,
            district: data.delivery.district,
            city: data.delivery.city,
            province: data.delivery.province,
            shippingFee: data.delivery.shippingFee,
            createdBy: data.createdBy,
          },
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
        await completeRentalClaim(tx, data.shopId, data.idempotency, result);
      }
      return result;
    });
  } catch (error) {
    if (isOverlapError(error)) throw new RentalOverlapError();
    throw error;
  }
}
