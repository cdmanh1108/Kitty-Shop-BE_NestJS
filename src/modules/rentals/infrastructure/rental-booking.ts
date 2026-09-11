import {
  ALLOCATION_STATUS,
  RENTAL_ITEM_STATUS,
  RENTAL_STATUS,
} from '@modules/rentals/domain/rental-status';

import { DEPOSIT_STATUS, ORDER_PAYMENT_STATUS } from '@modules/finance/domain/payment-status';

import type { JsonSerialized } from '@common/types/json';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { Prisma } from '@prisma/client';
import type { RentalOrderDetails } from '../domain/rental.models';
import {
  RentalOverlapError,
  type CreateRentalOrderData,
  type RentalRepository,
} from '../domain/rental.repository';
import { getWithTx } from './rental-queries';
import { isOverlapError } from './rental-errors';

export async function createOrder(
  prisma: PrismaService,
  data: CreateRentalOrderData,
): ReturnType<RentalRepository['createOrder']> {
  try {
    return await serializableTransaction(prisma, async (tx) => {
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
        },
      });
      const result = await getWithTx(tx, data.shopId, order.id);
      if (data.idempotency) {
        await tx.idempotencyRecord.update({
          where: {
            shopId_scope_key: {
              shopId: data.shopId,
              scope: data.idempotency.scope,
              key: data.idempotency.key,
            },
          },
          data: {
            responseCode: 201,
            responseBody: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
      }
      return result;
    });
  } catch (error) {
    if (isOverlapError(error)) throw new RentalOverlapError();
    throw error;
  }
}
export async function claimIdempotency(
  prisma: PrismaService,
  input: Parameters<RentalRepository['claimIdempotency']>[0],
): ReturnType<RentalRepository['claimIdempotency']> {
  await prisma.idempotencyRecord.deleteMany({
    where: {
      shopId: input.shopId,
      scope: input.scope,
      key: input.key,
      expiresAt: { lte: new Date() },
    },
  });

  try {
    await prisma.idempotencyRecord.create({ data: input });
    return { state: 'CLAIMED' as const };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
      throw error;
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { shopId_scope_key: { shopId: input.shopId, scope: input.scope, key: input.key } },
      select: { requestHash: true, responseBody: true, completedAt: true },
    });
    if (!existing) return claimIdempotency(prisma, input);
    if (existing.requestHash !== input.requestHash) return { state: 'HASH_MISMATCH' as const };
    if (existing.completedAt)
      return {
        state: 'COMPLETED' as const,
        // This scope persists only JSON.stringify(getWithTx(...)) in createOrder.
        // The stored JSON is the serialized read model, not a live Prisma record.
        responseBody: existing.responseBody as JsonSerialized<RentalOrderDetails>,
      };
    return { state: 'IN_PROGRESS' as const };
  }
}
export async function releaseIdempotency(
  prisma: PrismaService,
  shopId: string,
  scope: string,
  key: string,
): ReturnType<RentalRepository['releaseIdempotency']> {
  await prisma.idempotencyRecord.deleteMany({
    where: { shopId, scope, key, completedAt: null },
  });
}
