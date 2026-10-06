import type { RentalOutboxEvent } from '../domain/rental.events';
import {
  ALLOCATION_STATUS,
  RENTAL_ITEM_STATUS,
  RENTAL_STATUS,
} from '@modules/rentals/domain/rental-status';
import type { RentalPolicy } from '@modules/settings/public/rental-policy';
import { calculateRentalReturnFees } from '../domain/rental-return-fees';
import { rentalReturnFeeToken } from './rental-return-fee-token';
import { lockRentalOrder } from './rental-order-lock';
import { multiplyRentalPricingAmount } from '../domain/rental-cycle-pricing';
import { rentalPaidQuantity } from '../domain/rental-accessories';
import { RentalInvariantError, RentalFeePreviewChangedError } from '../domain/rental-errors';
import type { Clock } from '@common/clock/clock';
import { recomputeOrderPaymentState } from '@modules/finance/public/order-payment-state-transaction';
import { recordRentalReturnInspection } from '@modules/catalog/public/rental-inventory-transaction';
import { writeTransactionalAuditLog } from '@modules/audit/public/transactional-audit';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { Prisma } from '@prisma/client';
import { CHARGE_TYPE } from '../domain/charge-type';
import type { ReceiveRentalReturnData } from '../domain/ports/rental-lifecycle.port';
import type { RentalOrderDetails } from '../domain/rental.models';
import { getWithTx } from './rental-admin.queries';
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
    if (!(await lockRentalOrder(tx, input))) return null;
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

    const itemCount = rentalPaidQuantity(order.items);
    const late = calculateRentalReturnFees({
      rentalStartAt: order.rentalStartAt,
      dueAt: order.rentalEndAt,
      returnedAt,
      items: order.items,
      overrides: input.items,
      policy,
    });
    if (
      input.feePreviewToken &&
      input.feePreviewToken !==
        rentalReturnFeeToken({
          orderId: order.id,
          dueAt: order.rentalEndAt,
          returnedAt,
          items: late.items,
        })
    )
      throw new RentalFeePreviewChangedError();
    for (const charge of input.manualCharges ?? []) {
      if (
        charge.chargeType === CHARGE_TYPE.LATE ||
        charge.chargeType === CHARGE_TYPE.RENTAL_EXTRA
      ) {
        throw new RentalInvariantError(
          'RETURN_FEE_OVERRIDE_REQUIRED',
          'Vui lòng ghi đè phí trả trễ tại đúng món đồ để tránh cộng trùng.',
        );
      }
      if (!Object.values(CHARGE_TYPE).some((type) => type === charge.chargeType)) {
        throw new RentalInvariantError('INVALID_CHARGE_TYPE', 'Loại phụ phí không hợp lệ.');
      }
      multiplyRentalPricingAmount(charge.amount, charge.quantity ?? 1);
    }
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
      const fee = late.items.find((line) => line.inventoryItemId === item.inventoryItemId)!;
      if (item.charge) {
        multiplyRentalPricingAmount(item.charge.amount, 1);
        const permitted =
          fee.billingRole === 'FREE_ACCESSORY'
            ? [CHARGE_TYPE.REPAIR, CHARGE_TYPE.DAMAGE, CHARGE_TYPE.LOST_ITEM]
            : [CHARGE_TYPE.CLEANING, CHARGE_TYPE.REPAIR, CHARGE_TYPE.DAMAGE, CHARGE_TYPE.LOST_ITEM];
        if (!permitted.some((type) => type === item.charge?.chargeType)) {
          throw new RentalInvariantError(
            'INVALID_INSPECTION_CHARGE',
            'Phí kiểm tra không phù hợp với vai trò món đồ.',
          );
        }
        if (!item.charge.description?.trim() || item.charge.description.trim().length > 2000) {
          throw new RentalInvariantError(
            'INSPECTION_CHARGE_REASON_REQUIRED',
            'Vui lòng nhập lý do phí kiểm tra món đồ, tối đa 2.000 ký tự.',
          );
        }
      }
      await tx.rentalReturnInspection.create({
        data: {
          orderId: order.id,
          inventoryItemId: item.inventoryItemId,
          condition: item.condition,
          note: item.note?.trim() || null,
          calculatedLateFee: fee.calculatedLateFee,
          calculatedAdditionalRental: fee.calculatedAdditionalRentalFee,
          lateFee: fee.lateFee,
          additionalRental: fee.additionalRentalFee,
          feeOverrideReason: fee.feeOverrideReason,
          pricingVersion: fee.pricingVersion,
        },
      });
      const targetStatus =
        INSPECTION_TO_INVENTORY_STATUS[item.condition as ItemInspectionCondition];
      await recordRentalReturnInspection(tx, {
        shopId: input.shopId,
        orderId: order.id,
        inventoryItemId: item.inventoryItemId,
        status: targetStatus,
        returnedAt,
        changedBy: input.actorMemberId,
        reason: `ORDER_RETURNED_${item.condition}`,
        notes: item.note?.trim() || null,
      });
      for (const [chargeType, amountValue] of [
        [CHARGE_TYPE.LATE, fee.lateFee],
        [CHARGE_TYPE.RENTAL_EXTRA, fee.additionalRentalFee],
      ] as const) {
        if (
          amountValue === 0 &&
          (chargeType === CHARGE_TYPE.RENTAL_EXTRA || !fee.feeOverrideReason)
        )
          continue;
        const amount = new Prisma.Decimal(amountValue);
        extraChargesTotal = extraChargesTotal.plus(amount);
        await tx.rentalOrderCharge.create({
          data: {
            shopId: input.shopId,
            orderId: order.id,
            orderItemId: fee.orderItemId,
            chargeType,
            description:
              fee.feeOverrideReason ??
              (chargeType === CHARGE_TYPE.LATE ? 'Phí ngày thuê thêm' : 'Phí lượt thuê mới'),
            amount,
            quantity: 1,
            createdBy: input.actorMemberId,
            metadata: {
              source: 'RETURN_TIME_FEE',
              inventoryItemId: fee.inventoryItemId,
              pricingVersion: fee.pricingVersion,
              lateDays: late.lateDays,
              calculatedLateFee: fee.calculatedLateFee,
              calculatedAdditionalRentalFee: fee.calculatedAdditionalRentalFee,
              overrideReason: fee.feeOverrideReason,
            },
          },
        });
      }
      if (item.charge) {
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
            description: item.charge.description?.trim(),
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
    for (const charge of input.manualCharges ?? []) {
      if (charge.amount > 0) {
        const amount = new Prisma.Decimal(charge.amount);
        extraChargesTotal = extraChargesTotal.plus(amount.times(charge.quantity ?? 1));
        await tx.rentalOrderCharge.create({
          data: {
            shopId: input.shopId,
            orderId: order.id,
            chargeType: charge.chargeType,
            description: charge.description ?? null,
            amount,
            quantity: charge.quantity ?? 1,
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
    await writeTransactionalAuditLog(tx, {
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
