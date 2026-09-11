import { INVENTORY_STATUS } from '@modules/catalog/domain/catalog-status';
import {
  RENTAL_ITEM_STATUS,
  ALLOCATION_STATUS,
  RENTAL_STATUS,
} from '@modules/rentals/domain/rental-status';

import { canRescheduleRental } from '../domain/rental-policy';
import { recomputeOrderPaymentState } from '@database/prisma/order-payment-state';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import type { Prisma } from '@prisma/client';
import { RentalOverlapError, type RentalRepository } from '../domain/rental.repository';
import { getWithTx } from './rental-queries';
import { isOverlapError } from './rental-errors';

export async function transition(
  prisma: PrismaService,
  input: Parameters<RentalRepository['transition']>[0],
): ReturnType<RentalRepository['transition']> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
    });
    if (!order || !input.fromStatuses.some((status) => status === order.status)) return null;
    const now = new Date();
    const updateData: Prisma.RentalOrderUpdateManyMutationInput = {
      status: input.toStatus,
      updatedBy: input.changedBy,
      ...(input.toStatus === RENTAL_STATUS.ACTIVE ? { actualStartedAt: now } : {}),
      ...(input.toStatus === RENTAL_STATUS.COMPLETED ? { completedAt: now } : {}),
      ...(input.toStatus === RENTAL_STATUS.CANCELLED ? { cancelledAt: now } : {}),
    };
    const transitioned = await tx.rentalOrder.updateMany({
      where: { id: order.id, shopId: input.shopId, status: order.status },
      data: updateData,
    });
    if (transitioned.count !== 1) return null;
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

    if (input.toStatus === RENTAL_STATUS.CONFIRMED) {
      await tx.rentalItemAllocation.updateMany({
        where: { orderId: order.id, status: ALLOCATION_STATUS.HELD },
        data: { status: ALLOCATION_STATUS.CONFIRMED },
      });
      await tx.rentalOrderItem.updateMany({
        where: { orderId: order.id },
        data: { status: RENTAL_ITEM_STATUS.CONFIRMED },
      });
    } else if (input.toStatus === RENTAL_STATUS.ACTIVE) {
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
        const inventory = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: allocation.inventoryItemId },
        });
        await tx.inventoryItem.update({
          where: { id: inventory.id },
          data: { currentStatus: INVENTORY_STATUS.RENTED, lastRentedAt: now },
        });
        await tx.inventoryStatusHistory.create({
          data: {
            shopId: input.shopId,
            inventoryItemId: inventory.id,
            fromStatus: inventory.currentStatus,
            toStatus: INVENTORY_STATUS.RENTED,
            orderId: order.id,
            changedBy: input.changedBy,
            reason: 'ORDER_STARTED',
          },
        });
      }
    } else if (input.toStatus === RENTAL_STATUS.COMPLETED) {
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
      },
    });
    return getWithTx(tx, input.shopId, order.id);
  });
}
export async function reschedule(
  prisma: PrismaService,
  input: Parameters<RentalRepository['reschedule']>[0],
): ReturnType<RentalRepository['reschedule']> {
  try {
    return await serializableTransaction(prisma, async (tx) => {
      const order = await tx.rentalOrder.findFirst({
        where: { id: input.orderId, shopId: input.shopId },
      });
      if (!order || !canRescheduleRental(order.status)) return null;
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
