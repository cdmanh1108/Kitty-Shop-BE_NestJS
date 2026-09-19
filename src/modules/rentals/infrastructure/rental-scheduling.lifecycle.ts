import { assertInventoryRentable } from './rental-inventory';
import { getWithTx } from './rental-queries';
import { isOverlapError } from './rental-errors';
import { recomputeOrderPaymentState } from '@database/prisma/order-payment-state';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { ALLOCATION_STATUS } from '../domain/rental-status';
import { assertRentalReschedule, canRescheduleRental } from '../domain/rental-policy';
import { RentalOverlapError, type RentalRepository } from '../domain/rental.repository';
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';
import { assertChargeMutationAllowed } from '../domain/rental-monetary.policy';
import { lockRentalMonetaryOrder } from './rental-monetary-boundary';

export async function reschedule(
  prisma: PrismaService,
  input: Parameters<RentalRepository['reschedule']>[0],
  policy: RentalPolicy,
): ReturnType<RentalRepository['reschedule']> {
  try {
    return await serializableTransaction(prisma, async (tx) => {
      const order = await tx.rentalOrder.findFirst({
        where: { id: input.orderId, shopId: input.shopId },
      });
      if (!order || !canRescheduleRental(order.status)) return null;
      assertRentalReschedule({
        createdAt: order.createdAt,
        rentalStartAt: order.rentalStartAt,
        rentalEndAt: order.rentalEndAt,
        from: input.from,
        until: input.until,
        maxDaysFromBooking: policy.reschedule.maxDaysFromBooking,
      });
      const rescheduled = await tx.rentalOrder.updateMany({
        where: { id: order.id, shopId: input.shopId, status: order.status },
        data: { rentalStartAt: input.from, rentalEndAt: input.until, updatedBy: input.changedBy },
      });
      if (rescheduled.count !== 1) return null;
      await tx.rentalOrderItem.updateMany({
        where: { orderId: order.id },
        data: { rentalStartAt: input.from, rentalEndAt: input.until },
      });
      const allocations = await tx.rentalItemAllocation.findMany({
        where: {
          orderId: order.id,
          status: { in: [ALLOCATION_STATUS.HELD, ALLOCATION_STATUS.CONFIRMED] },
        },
      });
      await assertInventoryRentable(tx, {
        shopId: input.shopId,
        inventoryIds: allocations.map((allocation) => allocation.inventoryItemId),
        excludeOrderId: order.id,
      });
      for (const allocation of allocations) {
        await tx.rentalItemAllocation.update({
          where: { id: allocation.id },
          data: { reservedFrom: input.from, reservedUntil: input.until },
        });
      }
      await tx.outboxEvent.create({
        data: {
          shopId: input.shopId,
          eventType: 'RENTAL_ORDER_RESCHEDULED',
          aggregateType: 'rental_order',
          aggregateId: order.id,
          payload: {
            orderId: order.id,
            rentalStartAt: input.from.toISOString(),
            rentalEndAt: input.until.toISOString(),
          },
        },
      });
      return getWithTx(tx, input.shopId, order.id);
    });
  } catch (error) {
    if (isOverlapError(error)) throw new RentalOverlapError();
    throw error;
  }
}

export async function addCharge(
  prisma: PrismaService,
  input: Parameters<RentalRepository['addCharge']>[0],
): ReturnType<RentalRepository['addCharge']> {
  return serializableTransaction(prisma, async (tx) => {
    if (!(await lockRentalMonetaryOrder(tx, input))) return null;
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
    });
    if (!order) return null;
    const settlement = await tx.rentalSettlement.findUnique({ where: { orderId: order.id } });
    assertChargeMutationAllowed({ status: order.status, hasSettlement: Boolean(settlement) });
    await tx.rentalOrderCharge.create({
      data: {
        shopId: input.shopId,
        orderId: input.orderId,
        chargeType: input.chargeType,
        description: input.description,
        amount: input.amount,
        quantity: input.quantity,
        createdBy: input.createdBy,
      },
    });
    const increment = input.amount * input.quantity;
    await tx.rentalOrder.update({
      where: { id: input.orderId },
      data: { chargesTotal: { increment }, grandTotal: { increment }, updatedBy: input.createdBy },
    });
    await recomputeOrderPaymentState(tx, input.orderId);
    return getWithTx(tx, input.shopId, input.orderId);
  });
}
