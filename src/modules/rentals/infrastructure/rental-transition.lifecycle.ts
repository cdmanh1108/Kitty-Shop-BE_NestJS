import { assertInventoryRentable } from './rental-inventory';
import type { RentalOutboxEvent } from '../domain/rental.events';
import {
  RENTAL_ITEM_STATUS,
  ALLOCATION_STATUS,
  RENTAL_STATUS,
} from '@modules/rentals/domain/rental-status';
import { canTransitionRental } from '../domain/rental-policy';
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';
import { RentalInvariantError } from '../domain/rental-errors';
import type { Clock } from '@common/clock/clock';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import type { Prisma } from '@prisma/client';
import type { RentalLifecycleRepository } from '../domain/ports/rental-lifecycle.port';
import { getWithTx } from './rental-admin.queries';
import { lockRentalOrder } from './rental-order-lock';
import { TRANSACTION_STATUS } from '@modules/finance/domain/payment-status';
import { canTransitionDelivery, DELIVERY_STATUS } from '@modules/deliveries/domain/delivery-status';

export async function transition(
  prisma: PrismaService,
  input: Parameters<RentalLifecycleRepository['transition']>[0],
  policy: RentalPolicy,
  clock: Clock,
): ReturnType<RentalLifecycleRepository['transition']> {
  return serializableTransaction(prisma, async (tx) => {
    if (input.toStatus === RENTAL_STATUS.CANCELLED) {
      if (!(await lockRentalOrder(tx, input))) return null;
    }
    const orderWhere = {
      id: input.orderId,
      shopId: input.shopId,
      ...(input.expectedWebAccountId ? { webAccountId: input.expectedWebAccountId } : {}),
      ...(input.expectedSource ? { source: input.expectedSource } : {}),
      ...(input.expectedPaymentStatus ? { paymentStatus: input.expectedPaymentStatus } : {}),
    };
    const order = await tx.rentalOrder.findFirst({
      where: orderWhere,
    });
    if (!order || !input.fromStatuses.some((status) => status === order.status)) return null;
    if (input.requireNoCompletedPayments) {
      const paymentCount = await tx.paymentTransaction.count({
        where: {
          orderId: order.id,
          status: TRANSACTION_STATUS.COMPLETED,
          voidedAt: null,
        },
      });
      if (paymentCount > 0) {
        throw new RentalInvariantError(
          'WEB_ORDER_PAYMENT_PREVENTS_CANCELLATION',
          'Đơn thuê đã có giao dịch thanh toán hoặc đặt cọc.',
        );
      }
    }
    if (input.toStatus === RENTAL_STATUS.CONFIRMED) {
      throw new RentalInvariantError(
        'CONFIRMATION_REQUIRED',
        'Vui lòng sử dụng thao tác xác nhận đơn với thông tin đặt cọc.',
      );
    }
    if (input.toStatus === RENTAL_STATUS.COMPLETED || input.toStatus === RENTAL_STATUS.RETURNED) {
      throw new RentalInvariantError(
        'RETURN_WORKFLOW_REQUIRED',
        'Không thể chuyển trạng thái trực tiếp. Vui lòng sử dụng quy trình nhận đồ trả và kế toán.',
      );
    }
    if (!canTransitionRental(order.status, input.toStatus)) return null;

    if (input.toStatus === RENTAL_STATUS.CANCELLED) {
      const deliveries = await tx.deliveryJob.findMany({
        where: { orderId: order.id, shopId: input.shopId },
        select: { status: true },
      });
      if (
        deliveries.some(
          (delivery) =>
            delivery.status !== DELIVERY_STATUS.CANCELLED &&
            !canTransitionDelivery(delivery.status, DELIVERY_STATUS.CANCELLED),
        )
      ) {
        return null;
      }
    }

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
      ...(input.changedBy ? { updatedBy: input.changedBy } : {}),
    };
    if (input.toStatus === RENTAL_STATUS.ACTIVE) updateData.actualStartedAt = now;
    if (input.toStatus === RENTAL_STATUS.CANCELLED) updateData.cancelledAt = now;

    const updated = await tx.rentalOrder.updateMany({
      where: { ...orderWhere, status: order.status },
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
      await tx.deliveryJob.updateMany({
        where: {
          orderId: order.id,
          shopId: input.shopId,
          status: { in: [DELIVERY_STATUS.PENDING, DELIVERY_STATUS.READY] },
        },
        data: { status: DELIVERY_STATUS.CANCELLED },
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
