import { assertInventoryRentable } from './rental-inventory';
import type { RentalOutboxEvent } from '../domain/rental.events';
import { INVENTORY_STATUS } from '@modules/catalog/domain/catalog-status';
import {
  RENTAL_ITEM_STATUS,
  ALLOCATION_STATUS,
  RENTAL_STATUS,
} from '@modules/rentals/domain/rental-status';

import {
  assertRentalReschedule,
  canRescheduleRental,
  canTransitionRental,
} from '../domain/rental-policy';
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';

import { calculateLateCharges, rewardForCompletedRental } from '../domain/rental-settlement';
import { RentalInvariantError } from '../domain/rental-errors';
import type { Clock } from '@common/clock/clock';
import { recomputeOrderPaymentState } from '@database/prisma/order-payment-state';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { Prisma } from '@prisma/client';
import { CHARGE_TYPE } from '../domain/charge-type';
import { RentalOverlapError, type RentalRepository } from '../domain/rental.repository';
import type { RentalOrderDetails } from '../domain/rental.models';
import { getWithTx } from './rental-queries';
import { isOverlapError } from './rental-errors';

export async function transition(
  prisma: PrismaService,
  input: Parameters<RentalRepository['transition']>[0],
  policy: RentalPolicy,
  clock: Clock,
): ReturnType<RentalRepository['transition']> {
  return serializableTransaction(prisma, async (tx) => {
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
    });
    if (!order || !input.fromStatuses.some((status) => status === order.status)) return null;
    if (input.toStatus === RENTAL_STATUS.CONFIRMED)
      throw new RentalInvariantError(
        'CONFIRMATION_REQUIRED',
        'Vui lòng sử dụng thao tác xác nhận đơn với thông tin đặt cọc.',
      );
    if (!canTransitionRental(order.status, input.toStatus)) return null;
    if (input.toStatus === RENTAL_STATUS.ACTIVE) {
      const allocations = await tx.rentalItemAllocation.findMany({
        where: { orderId: order.id, releasedAt: null },
        select: { inventoryItemId: true },
      });
      await assertInventoryRentable(tx, {
        shopId: input.shopId,
        inventoryIds: allocations.map((allocation) => allocation.inventoryItemId),
        excludeOrderId: order.id,
      });
    }
    const now = clock.now();
    const updateData: Prisma.RentalOrderUpdateManyMutationInput = {
      status: input.toStatus,
      updatedBy: input.changedBy,
    };
    if (input.toStatus === RENTAL_STATUS.ACTIVE) updateData.actualStartedAt = now;
    if (input.toStatus === RENTAL_STATUS.COMPLETED) updateData.completedAt = now;
    if (input.toStatus === RENTAL_STATUS.CANCELLED) updateData.cancelledAt = now;

    const updated = await tx.rentalOrder.updateMany({
      where: { id: order.id, shopId: input.shopId, status: order.status },
      data: updateData,
    });
    if (updated.count !== 1) return null;
    await tx.rentalOrderStatusHistory.create({
      data: {
        shopId: input.shopId,
        orderId: order.id,
        fromStatus: order.status,
        toStatus: input.toStatus,
        reason: input.reason,
        changedBy: input.changedBy,
      },
    });

    if (input.toStatus === RENTAL_STATUS.ACTIVE) {
      await tx.rentalItemAllocation.updateMany({
        where: {
          orderId: order.id,
          status: { in: [ALLOCATION_STATUS.HELD, ALLOCATION_STATUS.CONFIRMED] },
        },
        data: { status: ALLOCATION_STATUS.ACTIVE },
      });
      await tx.rentalOrderItem.updateMany({
        where: { orderId: order.id },
        data: { status: RENTAL_ITEM_STATUS.ACTIVE },
      });
      const allocations = await tx.rentalItemAllocation.findMany({
        where: { orderId: order.id },
        select: { inventoryItemId: true },
      });
      for (const allocation of allocations) {
        await tx.inventoryItem.update({
          where: { id: allocation.inventoryItemId },
          data: { lastRentedAt: now },
        });
      }
    } else if (input.toStatus === RENTAL_STATUS.COMPLETED) {
      const itemCount = await tx.rentalOrderItem.aggregate({
        where: { orderId: order.id },
        _sum: { quantity: true },
      });
      const late = calculateLateCharges({
        dueAt: order.rentalEndAt,
        returnedAt: now,
        itemCount: itemCount._sum.quantity ?? 0,
        rentalSubtotal: order.rentalSubtotal.toString(),
        policy,
      });
      if (late.lateDays > 0) {
        const lateAmount = new Prisma.Decimal(late.lateFee);
        const additionalAmount = new Prisma.Decimal(late.additionalRental);
        if (lateAmount.greaterThan(0))
          await tx.rentalOrderCharge.create({
            data: {
              shopId: input.shopId,
              orderId: order.id,
              chargeType: CHARGE_TYPE.LATE,
              amount: lateAmount,
              quantity: 1,
              createdBy: input.changedBy,
              metadata: { source: 'AUTO_LATE_RETURN', lateDays: late.lateDays },
            },
          });
        if (additionalAmount.greaterThan(0))
          await tx.rentalOrderCharge.create({
            data: {
              shopId: input.shopId,
              orderId: order.id,
              chargeType: CHARGE_TYPE.RENTAL_EXTRA,
              amount: additionalAmount,
              quantity: 1,
              createdBy: input.changedBy,
              metadata: {
                source: 'AUTO_LATE_RETURN',
                thresholdDay: policy.lateReturn.newRentalChargeFromLateDay,
              },
            },
          });
        const total = lateAmount.plus(additionalAmount);
        if (total.greaterThan(0)) {
          await tx.rentalOrder.update({
            where: { id: order.id },
            data: { chargesTotal: { increment: total }, grandTotal: { increment: total } },
          });
          await recomputeOrderPaymentState(tx, order.id);
        }
      }
      await tx.rentalItemAllocation.updateMany({
        where: { orderId: order.id, status: ALLOCATION_STATUS.ACTIVE },
        data: { status: ALLOCATION_STATUS.RETURNED, releasedAt: now },
      });
      await tx.rentalOrderItem.updateMany({
        where: { orderId: order.id },
        data: { status: RENTAL_ITEM_STATUS.RETURNED },
      });
      const allocations = await tx.rentalItemAllocation.findMany({
        where: { orderId: order.id },
        select: { inventoryItemId: true },
      });
      for (const allocation of allocations) {
        const inventory = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: allocation.inventoryItemId },
        });
        await tx.inventoryItem.update({
          where: { id: inventory.id },
          data: {
            currentStatus: INVENTORY_STATUS.CLEANING,
            totalRentalCount: { increment: 1 },
            lastRentedAt: now,
          },
        });
        await tx.inventoryStatusHistory.create({
          data: {
            shopId: input.shopId,
            inventoryItemId: inventory.id,
            fromStatus: inventory.currentStatus,
            toStatus: INVENTORY_STATUS.CLEANING,
            orderId: order.id,
            changedBy: input.changedBy,
            reason: 'ORDER_RETURNED',
          },
        });
      }
      if (policy.loyalty.enabled) {
        const completedCount = await tx.customerLoyaltyEntry.count({
          where: { shopId: input.shopId, customerId: order.customerId, entryType: 'QUALIFIED' },
        });
        const rewardValue = rewardForCompletedRental(completedCount, policy);
        await tx.customerLoyaltyEntry.create({
          data: {
            shopId: input.shopId,
            customerId: order.customerId,
            orderId: order.id,
            entryType: 'QUALIFIED',
            rewardValue,
          },
        });
        if (rewardValue > 0)
          await tx.outboxEvent.create({
            data: {
              shopId: input.shopId,
              eventType: 'LOYALTY_REWARD_EARNED',
              aggregateType: 'rental_order',
              aggregateId: order.id,
              payload: { orderId: order.id, customerId: order.customerId, rewardValue },
            },
          });
      }
    } else if (input.toStatus === RENTAL_STATUS.CANCELLED) {
      await tx.rentalItemAllocation.updateMany({
        where: {
          orderId: order.id,
          status: { in: [ALLOCATION_STATUS.HELD, ALLOCATION_STATUS.CONFIRMED] },
        },
        data: { status: ALLOCATION_STATUS.CANCELLED, releasedAt: now },
      });
      await tx.rentalOrderItem.updateMany({
        where: { orderId: order.id },
        data: { status: RENTAL_ITEM_STATUS.CANCELLED },
      });
    }

    await tx.outboxEvent.create({
      data: {
        shopId: input.shopId,
        eventType: `RENTAL_ORDER_${input.toStatus}`,
        aggregateType: 'rental_order',
        aggregateId: order.id,
        payload: { orderId: order.id, fromStatus: order.status, toStatus: input.toStatus },
      } satisfies RentalOutboxEvent,
    });
    return getWithTx(tx, input.shopId, order.id);
  });
}
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
        } satisfies RentalOutboxEvent,
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
  return prisma.$transaction(async (tx) => {
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
    });
    if (!order) return null;
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
      data: {
        chargesTotal: { increment },
        grandTotal: { increment },
        updatedBy: input.createdBy,
      },
    });
    await recomputeOrderPaymentState(tx, input.orderId);
    return getWithTx(tx, input.shopId, input.orderId);
  });
}

export async function returnDocumentCollateral(
  prisma: PrismaService,
  shopId: string,
  orderId: string,
  changedBy: string,

  clock: Clock,
): Promise<RentalOrderDetails> {
  return serializableTransaction(prisma, async (tx) => {
    const order = await tx.rentalOrder.findFirst({ where: { id: orderId, shopId } });
    if (!order) return null;
    if (order.collateralMethod !== 'DOCUMENT')
      throw new RentalInvariantError(
        'COLLATERAL_METHOD_NOT_ALLOWED',
        'Đơn thuê này không đặt cọc bằng giấy tờ.',
      );
    if (order.status !== RENTAL_STATUS.COMPLETED || order.collateralStatus !== 'HELD')
      throw new RentalInvariantError(
        'COLLATERAL_TRANSITION_NOT_ALLOWED',
        'Không thể trả giấy tờ đặt cọc ở trạng thái hiện tại.',
      );
    await tx.rentalOrder.update({
      where: { id: order.id },
      data: {
        collateralStatus: 'RETURNED',
        collateralReturnedAt: clock.now(),
        updatedBy: changedBy,
      },
    });
    await tx.outboxEvent.create({
      data: {
        shopId,
        eventType: 'RENTAL_COLLATERAL_RETURNED',
        aggregateType: 'rental_order',
        aggregateId: order.id,
        payload: { orderId: order.id },
      },
    });
    return getWithTx(tx, shopId, order.id);
  });
}
