import type { RentalOutboxEvent } from '../domain/rental.events';
import {
  ALLOCATION_STATUS,
  RENTAL_ITEM_STATUS,
  RENTAL_STATUS,
} from '@modules/rentals/domain/rental-status';
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';
import { calculateLateCharges } from '../domain/rental-settlement';
import { RentalInvariantError } from '../domain/rental-errors';
import type { Clock } from '@common/clock/clock';
import { recomputeOrderPaymentState } from '@database/prisma/order-payment-state';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { Prisma } from '@prisma/client';
import { CHARGE_TYPE } from '../domain/charge-type';
import type { ReceiveRentalReturnData } from '../domain/rental.repository';
import type { RentalOrderDetails } from '../domain/rental.models';
import { getWithTx } from './rental-queries';
import {
  assertReturnInspection,
  INSPECTION_TO_INVENTORY_STATUS,
  type ItemInspectionCondition,
} from '../domain/rental-return';

export async function receiveReturn(
  prisma: PrismaService,
  input: ReceiveRentalReturnData,
  policy: RentalPolicy,
  clock: Clock,
): Promise<RentalOrderDetails> {
  return serializableTransaction(prisma, async (tx) => {
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
      include: {
        items: {
          include: {
            allocations: { where: { status: ALLOCATION_STATUS.ACTIVE, releasedAt: null } },
          },
        },
      },
    });
    if (!order) return null;
    if (order.status !== RENTAL_STATUS.ACTIVE) {
      throw new RentalInvariantError(
        'RENTAL_TRANSITION_NOT_ALLOWED',
        'Chỉ có thể nhận đồ trả cho đơn đang ở trạng thái đang thuê.',
      );
    }
    const returnedAt = input.actualReturnedAt ?? clock.now();
    if (returnedAt.getTime() < order.rentalStartAt.getTime()) {
      throw new RentalInvariantError(
        'INVALID_RETURN_TIME',
        'Thời gian trả đồ không thể trước thời gian bắt đầu thuê.',
      );
    }
    const allocatedInventoryIds = order.items.flatMap((item) =>
      item.allocations.map((allocation) => allocation.inventoryItemId),
    );
    assertReturnInspection({
      allocatedInventoryIds,
      inspectionItems: input.items.map((item) => ({
        ...item,
        condition: item.condition as ItemInspectionCondition,
      })),
    });

    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const late = calculateLateCharges({
      dueAt: order.rentalEndAt,
      returnedAt,
      itemCount,
      rentalSubtotal: order.rentalSubtotal.toString(),
      policy,
    });
    await tx.rentalItemAllocation.updateMany({
      where: { orderId: order.id, status: ALLOCATION_STATUS.ACTIVE },
      data: { status: ALLOCATION_STATUS.RETURNED, releasedAt: returnedAt },
    });
    await tx.rentalOrderItem.updateMany({
      where: { orderId: order.id },
      data: { status: RENTAL_ITEM_STATUS.RETURNED },
    });
    const lateAmount = new Prisma.Decimal(late.lateFee);
    const additionalAmount = new Prisma.Decimal(late.additionalRental);
    await tx.rentalReturn.create({
      data: {
        orderId: order.id,
        shopId: input.shopId,
        returnedAt,
        receivedBy: input.actorMemberId,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        lateDays: late.lateDays,
        lateFee: lateAmount,
        additionalRental: additionalAmount,
        note: input.note?.trim() || null,
      },
    });

    let extraChargesTotal = new Prisma.Decimal(0);
    for (const item of input.items) {
      await tx.rentalReturnInspection.create({
        data: {
          orderId: order.id,
          inventoryItemId: item.inventoryItemId,
          condition: item.condition,
          note: item.note?.trim() || null,
        },
      });
      const targetStatus =
        INSPECTION_TO_INVENTORY_STATUS[item.condition as ItemInspectionCondition];
      const inventory = await tx.inventoryItem.findUniqueOrThrow({
        where: { id: item.inventoryItemId },
      });
      await tx.inventoryItem.update({
        where: { id: inventory.id },
        data: {
          currentStatus: targetStatus,
          totalRentalCount: { increment: 1 },
          lastRentedAt: returnedAt,
        },
      });
      await tx.inventoryStatusHistory.create({
        data: {
          shopId: input.shopId,
          inventoryItemId: inventory.id,
          fromStatus: inventory.currentStatus,
          toStatus: targetStatus,
          orderId: order.id,
          changedBy: input.actorMemberId,
          reason: `ORDER_RETURNED_${item.condition}`,
          notes: item.note?.trim() || null,
        },
      });
      if (item.charge && item.charge.amount > 0) {
        const matchingOrderItem = order.items.find((orderItem) =>
          orderItem.allocations.some(
            (allocation) => allocation.inventoryItemId === item.inventoryItemId,
          ),
        );
        const amount = new Prisma.Decimal(item.charge.amount);
        extraChargesTotal = extraChargesTotal.plus(amount);
        await tx.rentalOrderCharge.create({
          data: {
            shopId: input.shopId,
            orderId: order.id,
            orderItemId: matchingOrderItem?.id ?? null,
            chargeType: item.charge.chargeType,
            description: item.charge.description ?? `Phụ thu kiểm tra đồ (${item.condition})`,
            amount,
            quantity: 1,
            createdBy: input.actorMemberId,
            metadata: {
              source: 'RETURN_INSPECTION',
              inventoryItemId: item.inventoryItemId,
              condition: item.condition,
            },
          },
        });
      }
    }
    if (lateAmount.greaterThan(0)) {
      extraChargesTotal = extraChargesTotal.plus(lateAmount);
      await tx.rentalOrderCharge.create({
        data: {
          shopId: input.shopId,
          orderId: order.id,
          chargeType: CHARGE_TYPE.LATE,
          description: `Phí trả trễ (${late.lateDays} ngày)`,
          amount: lateAmount,
          quantity: 1,
          createdBy: input.actorMemberId,
          metadata: { source: 'AUTO_LATE_RETURN', lateDays: late.lateDays },
        },
      });
    }
    if (additionalAmount.greaterThan(0)) {
      extraChargesTotal = extraChargesTotal.plus(additionalAmount);
      await tx.rentalOrderCharge.create({
        data: {
          shopId: input.shopId,
          orderId: order.id,
          chargeType: CHARGE_TYPE.RENTAL_EXTRA,
          description: `Phí thuê thêm (trả trễ từ ngày thứ ${policy.lateReturn.newRentalChargeFromLateDay})`,
          amount: additionalAmount,
          quantity: 1,
          createdBy: input.actorMemberId,
          metadata: {
            source: 'AUTO_LATE_RETURN',
            thresholdDay: policy.lateReturn.newRentalChargeFromLateDay,
          },
        },
      });
    }
    for (const charge of input.manualCharges ?? []) {
      if (charge.amount > 0) {
        const amount = new Prisma.Decimal(charge.amount);
        extraChargesTotal = extraChargesTotal.plus(amount);
        await tx.rentalOrderCharge.create({
          data: {
            shopId: input.shopId,
            orderId: order.id,
            chargeType: charge.chargeType,
            description: charge.description ?? null,
            amount,
            quantity: 1,
            createdBy: input.actorMemberId,
            metadata: { source: 'RETURN_MANUAL_CHARGE' },
          },
        });
      }
    }

    await tx.rentalOrder.update({
      where: { id: order.id },
      data: {
        status: RENTAL_STATUS.RETURNED,
        actualReturnedAt: returnedAt,
        chargesTotal: { increment: extraChargesTotal },
        grandTotal: { increment: extraChargesTotal },
        updatedBy: input.actorMemberId,
      },
    });
    if (extraChargesTotal.greaterThan(0)) await recomputeOrderPaymentState(tx, order.id);
    await tx.rentalOrderStatusHistory.create({
      data: {
        shopId: input.shopId,
        orderId: order.id,
        fromStatus: order.status,
        toStatus: RENTAL_STATUS.RETURNED,
        reason: 'RETURN_RECEIVED',
        note: input.note?.trim() || null,
        changedBy: input.actorMemberId,
      },
    });
    await tx.auditLog.create({
      data: {
        shopId: input.shopId,
        actorUserId: input.actorUserId,
        actorMemberId: input.actorMemberId,
        action: 'RENTAL_ORDER_RETURNED',
        entityType: 'rental_order',
        entityId: order.id,
        oldValues: { status: order.status },
        newValues: {
          status: RENTAL_STATUS.RETURNED,
          returnedAt: returnedAt.toISOString(),
          lateDays: late.lateDays,
          itemCount,
          extraChargesTotal: extraChargesTotal.toString(),
        },
      },
    });
    await tx.outboxEvent.create({
      data: {
        shopId: input.shopId,
        eventType: 'RENTAL_ORDER_RETURNED',
        aggregateType: 'rental_order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          fromStatus: RENTAL_STATUS.ACTIVE,
          toStatus: RENTAL_STATUS.RETURNED,
        },
      } satisfies RentalOutboxEvent,
    });
    return getWithTx(tx, input.shopId, order.id);
  });
}
