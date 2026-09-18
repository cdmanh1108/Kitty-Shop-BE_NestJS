import { rentalLedger, recordRentalReceipt } from './rental-ledger';
import type { RentalOutboxEvent } from '../domain/rental.events';
import { RENTAL_STATUS } from '@modules/rentals/domain/rental-status';
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';
import { rewardForCompletedRental } from '../domain/rental-settlement';
import { RentalInvariantError } from '../domain/rental-errors';
import type { Clock } from '@common/clock/clock';
import { recomputeOrderPaymentState } from '@database/prisma/order-payment-state';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { Prisma } from '@prisma/client';
import type { SettleRentalOrderData } from '../domain/rental.repository';
import type { RentalOrderDetails } from '../domain/rental.models';
import { getWithTx } from './rental-queries';

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
    const settlementType =
      order.collateralMethod === 'DOCUMENT'
        ? amountDue.greaterThan(0)
          ? 'COLLECTION'
          : 'COLLATERAL_ONLY'
        : refundAmount.greaterThan(0)
          ? 'REFUND'
          : amountDue.greaterThan(0)
            ? 'COLLECTION'
            : 'BALANCED';
    if (input.settlementType && input.settlementType !== settlementType) {
      throw new RentalInvariantError(
        'SETTLEMENT_CHANGED',
        'Số tiền kết toán đã thay đổi. Vui lòng tải lại đơn thuê.',
      );
    }
    if (
      order.collateralMethod === 'DOCUMENT' &&
      order.collateralStatus === 'HELD' &&
      !input.returnDocument
    ) {
      throw new RentalInvariantError(
        'DOCUMENT_COLLATERAL_RETURN_REQUIRED',
        'Vui lòng xác nhận đã trả lại giấy tờ đặt cọc cho khách trước khi hoàn tất kết toán.',
      );
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
