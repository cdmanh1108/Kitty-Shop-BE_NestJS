import { rentalLedger, recordRentalReceipt } from './rental-ledger';
import { assertInventoryRentable } from './rental-inventory';
import type { RentalOutboxEvent } from '../domain/rental.events';
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
import {
  RentalOverlapError,
  type ReceiveRentalReturnData,
  type RentalRepository,
  type ReturnPreviewData,
  type SettleRentalOrderData,
} from '../domain/rental.repository';
import type { RentalOrderDetails } from '../domain/rental.models';
import { getWithTx } from './rental-queries';
import { isOverlapError } from './rental-errors';
import {
  assertReturnInspection,
  INSPECTION_TO_INVENTORY_STATUS,
  type ItemInspectionCondition,
} from '../domain/rental-return';

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
    if (input.toStatus === RENTAL_STATUS.CONFIRMED) {
      throw new RentalInvariantError(
        'CONFIRMATION_REQUIRED',
        'Vui lòng sử dụng thao tác xác nhận đơn với thông tin đặt cọc.',
      );
    }
    if (input.toStatus === RENTAL_STATUS.COMPLETED || input.toStatus === RENTAL_STATUS.RETURNED) {
      throw new RentalInvariantError(
        'RETURN_WORKFLOW_REQUIRED',
        'Không thể chuyển trạng thái trực tiếp. Vui lòng sử dụng quy trình nhận đồ trả và kết toán.',
      );
    }
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
            allocations: {
              where: { status: ALLOCATION_STATUS.ACTIVE, releasedAt: null },
            },
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
      item.allocations.map((a) => a.inventoryItemId),
    );
    assertReturnInspection({
      allocatedInventoryIds,
      inspectionItems: input.items.map((i) => ({
        ...i,
        condition: i.condition as ItemInspectionCondition,
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
        const matchingOrderItem = order.items.find((oi) =>
          oi.allocations.some((a) => a.inventoryItemId === item.inventoryItemId),
        );
        const chargeAmount = new Prisma.Decimal(item.charge.amount);
        extraChargesTotal = extraChargesTotal.plus(chargeAmount);

        await tx.rentalOrderCharge.create({
          data: {
            shopId: input.shopId,
            orderId: order.id,
            orderItemId: matchingOrderItem?.id ?? null,
            chargeType: item.charge.chargeType,
            description: item.charge.description ?? `Phụ thu kiểm tra đồ (${item.condition})`,
            amount: chargeAmount,
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

    if (input.manualCharges?.length) {
      for (const charge of input.manualCharges) {
        if (charge.amount > 0) {
          const manualAmount = new Prisma.Decimal(charge.amount);
          extraChargesTotal = extraChargesTotal.plus(manualAmount);
          await tx.rentalOrderCharge.create({
            data: {
              shopId: input.shopId,
              orderId: order.id,
              chargeType: charge.chargeType,
              description: charge.description ?? null,
              amount: manualAmount,
              quantity: 1,
              createdBy: input.actorMemberId,
              metadata: { source: 'RETURN_MANUAL_CHARGE' },
            },
          });
        }
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

    if (extraChargesTotal.greaterThan(0)) {
      await recomputeOrderPaymentState(tx, order.id);
    }

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

export async function settleOrder(
  prisma: PrismaService,
  input: SettleRentalOrderData,
  policy: RentalPolicy,
  clock: Clock,
): Promise<RentalOrderDetails> {
  return serializableTransaction(prisma, async (tx) => {
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
      include: {
        confirmation: true,
        charges: { where: { voidedAt: null } },
        payments: { where: { status: 'COMPLETED', voidedAt: null } },
      },
    });
    if (!order) return null;
    if (order.status !== RENTAL_STATUS.RETURNED) {
      throw new RentalInvariantError(
        'RENTAL_TRANSITION_NOT_ALLOWED',
        'Chỉ có thể kết toán đơn ở trạng thái đã nhận trả.',
      );
    }

    const existingSettlement = await tx.rentalSettlement.findUnique({
      where: { orderId: order.id },
    });
    if (existingSettlement) {
      throw new RentalInvariantError('ORDER_ALREADY_SETTLED', 'Đơn thuê này đã được kết toán.');
    }

    const ledger = rentalLedger(order.payments);
    const depositAmount = ledger.depositHeld;
    const totalCharges = order.chargesTotal;
    const remaining = Prisma.Decimal.max(0, order.grandTotal.minus(ledger.paidRental));
    const refundAmount = Prisma.Decimal.max(0, depositAmount.minus(remaining));
    const amountDue = Prisma.Decimal.max(0, remaining.minus(depositAmount));

    let settlementType: string;
    if (order.collateralMethod === 'DOCUMENT') {
      settlementType = amountDue.greaterThan(0) ? 'COLLECTION' : 'COLLATERAL_ONLY';
    } else if (refundAmount.greaterThan(0)) {
      settlementType = 'REFUND';
    } else if (amountDue.greaterThan(0)) {
      settlementType = 'COLLECTION';
    } else {
      settlementType = 'BALANCED';
    }
    if (input.settlementType && input.settlementType !== settlementType) {
      throw new RentalInvariantError(
        'SETTLEMENT_CHANGED',
        'Số tiền kết toán đã thay đổi. Vui lòng tải lại đơn thuê.',
      );
    }

    if (order.collateralMethod === 'DOCUMENT') {
      if (order.collateralStatus === 'HELD' && !input.returnDocument) {
        throw new RentalInvariantError(
          'DOCUMENT_COLLATERAL_RETURN_REQUIRED',
          'Vui lòng xác nhận đã trả lại giấy tờ đặt cọc cho khách trước khi hoàn tất kết toán.',
        );
      }
    }

    const now = clock.now();
    const settledMoney = refundAmount.greaterThan(0)
      ? refundAmount
      : amountDue.greaterThan(0)
        ? amountDue
        : new Prisma.Decimal(0);

    const receipt = {
      orderId: order.id,
      shopId: input.shopId,
      customerId: order.customerId,
      actorMemberId: input.actorMemberId,
      paidAt: now,
      paymentMethod: input.paymentMethod ?? 'CASH',
      note: input.note,
    };
    const appliedDeposit = Prisma.Decimal.min(depositAmount, remaining);
    await recordRentalReceipt(tx, {
      ...receipt,
      key: 'RS-F-' + order.id,
      purpose: 'DEPOSIT_REFUND',
      direction: 'OUT',
      amount: refundAmount,
    });
    await recordRentalReceipt(tx, {
      ...receipt,
      key: 'RS-D-' + order.id,
      purpose: 'DEPOSIT',
      direction: 'OUT',
      amount: appliedDeposit,
      paymentMethod: 'DEPOSIT_OFFSET',
      source: 'INTERNAL_TRANSFER',
    });
    await recordRentalReceipt(tx, {
      ...receipt,
      key: 'RS-R-' + order.id,
      purpose: 'RENTAL_PAYMENT',
      direction: 'IN',
      amount: appliedDeposit,
      paymentMethod: 'DEPOSIT_OFFSET',
      source: 'INTERNAL_TRANSFER',
    });
    await recordRentalReceipt(tx, {
      ...receipt,
      key: 'RS-C-' + order.id,
      purpose: 'RENTAL_PAYMENT',
      direction: 'IN',
      amount: amountDue,
    });
    await recomputeOrderPaymentState(tx, order.id);

    await tx.rentalSettlement.create({
      data: {
        orderId: order.id,
        shopId: input.shopId,
        settledAt: now,
        settledBy: input.actorMemberId,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        settlementType,
        amount: settledMoney,
        depositAmount,
        totalCharges,
        refundAmount,
        amountDue,
        note: input.note ?? null,
        evidenceKey: input.evidence?.key ?? null,
        evidenceFilename: input.evidence?.filename ?? null,
        evidenceMimeType: input.evidence?.mimeType ?? null,
        evidenceSize: input.evidence?.size ?? null,
      },
    });

    await tx.rentalOrder.update({
      where: { id: order.id },
      data: {
        status: RENTAL_STATUS.COMPLETED,
        completedAt: now,
        collateralStatus: 'RETURNED',
        collateralReturnedAt: now,
        updatedBy: input.actorMemberId,
      },
    });

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
      if (rewardValue > 0) {
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
    }

    await tx.rentalOrderStatusHistory.create({
      data: {
        shopId: input.shopId,
        orderId: order.id,
        fromStatus: RENTAL_STATUS.RETURNED,
        toStatus: RENTAL_STATUS.COMPLETED,
        reason: 'SETTLEMENT_COMPLETED',
        note: input.note ?? null,
        changedBy: input.actorMemberId,
      },
    });

    await tx.auditLog.create({
      data: {
        shopId: input.shopId,
        actorUserId: input.actorUserId,
        actorMemberId: input.actorMemberId,
        action: 'RENTAL_ORDER_SETTLED',
        entityType: 'rental_order',
        entityId: order.id,
        oldValues: { status: order.status },
        newValues: {
          status: RENTAL_STATUS.COMPLETED,
          settlementType,
          amount: settledMoney.toString(),
          depositAmount: depositAmount.toString(),
          totalCharges: totalCharges.toString(),
          refundAmount: refundAmount.toString(),
          amountDue: amountDue.toString(),
          settledAt: now.toISOString(),
        },
      },
    });

    await tx.outboxEvent.create({
      data: {
        shopId: input.shopId,
        eventType: 'RENTAL_ORDER_COMPLETED',
        aggregateType: 'rental_order',
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          fromStatus: RENTAL_STATUS.RETURNED,
          toStatus: RENTAL_STATUS.COMPLETED,
        },
      } satisfies RentalOutboxEvent,
    });

    return getWithTx(tx, input.shopId, order.id);
  });
}

export async function getReturnPreview(
  prisma: PrismaService,
  shopId: string,
  orderId: string,
  returnedAt: Date | undefined,
  policy: RentalPolicy,
  clock: Clock,
): Promise<ReturnPreviewData> {
  const order = await prisma.rentalOrder.findFirst({
    where: { id: orderId, shopId },
    include: {
      items: true,
      confirmation: true,
      payments: { where: { status: 'COMPLETED', voidedAt: null } },
    },
  });
  if (!order) {
    throw new RentalInvariantError('RENTAL_NOT_FOUND', 'Không tìm thấy đơn thuê.');
  }

  const effectiveReturnedAt = returnedAt ?? clock.now();
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const late = calculateLateCharges({
    dueAt: order.rentalEndAt,
    returnedAt: effectiveReturnedAt,
    itemCount,
    rentalSubtotal: order.rentalSubtotal.toString(),
    policy,
  });

  const depositHeld = rentalLedger(order.payments).depositHeld.toString();

  return {
    dueAt: order.rentalEndAt,
    actualReturnedAt: effectiveReturnedAt,
    lateDays: late.lateDays,
    dailyLateFeePerSet: policy.lateReturn.feePerItemPerDay,
    lateFee: late.lateFee,
    additionalRental: late.additionalRental,
    itemCount,
    rentalSubtotal: order.rentalSubtotal.toString(),
    depositHeld,
    collateralMethod: order.collateralMethod,
    documentType: order.documentType,
  };
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

    if (order.status === RENTAL_STATUS.COMPLETED || order.status === RENTAL_STATUS.CANCELLED) {
      throw new RentalInvariantError(
        'ORDER_LOCKED',
        'Không thể thêm phụ phí cho đơn thuê đã đóng hoặc đã hủy.',
      );
    }

    const settlement = await tx.rentalSettlement.findUnique({
      where: { orderId: input.orderId },
    });
    if (settlement) {
      throw new RentalInvariantError(
        'ORDER_ALREADY_SETTLED',
        'Không thể thêm phụ phí sau khi đã kết toán đơn thuê.',
      );
    }

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
    if (order.collateralMethod !== 'DOCUMENT') {
      throw new RentalInvariantError(
        'COLLATERAL_METHOD_NOT_ALLOWED',
        'Đơn thuê này không đặt cọc bằng giấy tờ.',
      );
    }
    if (
      (order.status !== RENTAL_STATUS.COMPLETED && order.status !== RENTAL_STATUS.RETURNED) ||
      order.collateralStatus !== 'HELD'
    ) {
      throw new RentalInvariantError(
        'COLLATERAL_TRANSITION_NOT_ALLOWED',
        'Không thể trả giấy tờ đặt cọc ở trạng thái hiện tại.',
      );
    }
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
