import { recordRentalReceipt } from '@modules/finance/public/rental-receipt-transaction';
import { recomputeOrderPaymentState } from '@modules/finance/public/order-payment-state-transaction';
import {
  countQualifiedRentalLoyaltyEntries,
  createRentalLoyaltyEntry,
} from '@modules/customers/public/rental-loyalty-transaction';
import { writeTransactionalAuditLog } from '@modules/audit/public/transactional-audit';
import type { RentalOutboxEvent } from '../domain/rental.events';
import { RENTAL_STATUS } from '@modules/rentals/domain/rental-status';
import type { RentalPolicy } from '@modules/settings/public/rental-policy';
import { rewardForCompletedRental } from '../domain/rental-settlement';
import { RentalInvariantError, RentalFeePreviewChangedError } from '../domain/rental-errors';
import { assertSettlementAllowed } from '../domain/rental-monetary.policy';
import type { Clock } from '@common/clock/clock';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { Prisma } from '@prisma/client';
import type { SettleRentalOrderData } from '../domain/ports/rental-lifecycle.port';
import type { RentalOrderDetails } from '../domain/rental.models';
import { getWithTx } from './rental-admin.queries';
import { lockRentalOrder } from './rental-order-lock';
import { enqueueRentalEmail } from './rental-email.transaction';
import {
  evaluateSettlementFees,
  persistSettlementFeeAdjustments,
  settlementFeeContextInclude,
} from './rental-settlement-fees';

export async function settleOrder(
  prisma: PrismaService,
  input: SettleRentalOrderData,
  policy: RentalPolicy,
  clock: Clock,
): Promise<RentalOrderDetails> {
  return serializableTransaction(prisma, async (tx) => {
    if (!(await lockRentalOrder(tx, input))) return null;
    const order = await tx.rentalOrder.findFirst({
      where: { id: input.orderId, shopId: input.shopId },
      include: settlementFeeContextInclude,
    });
    if (!order) return null;
    const existingSettlement = await tx.rentalSettlement.findUnique({
      where: { orderId: order.id },
    });
    assertSettlementAllowed({ status: order.status, hasSettlement: Boolean(existingSettlement) });

    const plan = await evaluateSettlementFees(tx, order, input.feeOverrides);
    if (
      (input.feeOverrides?.length && !input.feePreviewToken) ||
      (input.feePreviewToken && input.feePreviewToken !== plan.preview.feePreviewToken)
    )
      throw new RentalFeePreviewChangedError();
    const ledger = plan.ledger;
    const depositAmount = ledger.depositHeld;
    const totalCharges = plan.totalCharges;
    const remaining = plan.remaining;
    const refundAmount = plan.refundAmount;
    const amountDue = plan.amountDue;
    const settlementType = refundAmount.greaterThan(0)
      ? 'REFUND'
      : amountDue.greaterThan(0)
        ? 'COLLECTION'
        : order.collateralMethod === 'DOCUMENT'
          ? 'COLLATERAL_ONLY'
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
    await persistSettlementFeeAdjustments(tx, order, plan, input, now);
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
      amount: plan.depositRefund,
    });
    await recordRentalReceipt(tx, {
      ...receipt,
      key: 'RS-O-' + order.id,
      purpose: 'ORDER_REFUND',
      direction: 'OUT',
      amount: plan.rentalRefund,
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
      const loyaltyOwner = order.webAccountId
        ? { type: 'WEB_ACCOUNT' as const, webAccountId: order.webAccountId }
        : { type: 'CRM_CUSTOMER' as const, customerId: order.customerId };
      const completedCount = await countQualifiedRentalLoyaltyEntries(tx, {
        shopId: input.shopId,
        owner: loyaltyOwner,
      });
      const rewardValue = rewardForCompletedRental(completedCount, policy);
      const { rewardId } = await createRentalLoyaltyEntry(tx, {
        shopId: input.shopId,
        customerId: order.customerId,
        orderId: order.id,
        rewardValue,
        owner: loyaltyOwner,
        createdAt: now,
      });
      if (rewardId) {
        await tx.outboxEvent.create({
          data: {
            shopId: input.shopId,
            eventType: 'LOYALTY_REWARD_EARNED',
            aggregateType: 'rental_order',
            aggregateId: order.id,
            payload: {
              orderId: order.id,
              customerId: order.customerId,
              ownerType: loyaltyOwner.type,
              ...(loyaltyOwner.type === 'WEB_ACCOUNT'
                ? { webAccountId: loyaltyOwner.webAccountId }
                : {}),
              rewardId,
              rewardValue,
            },
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
    await writeTransactionalAuditLog(tx, {
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
    });
    const event = await tx.outboxEvent.create({
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
    if (order.source === 'ONLINE' && order.notificationEmail)
      await enqueueRentalEmail(tx, {
        shopId: input.shopId,
        orderId: order.id,
        eventId: event.id,
        event: 'COMPLETED',
      });
    return getWithTx(tx, input.shopId, order.id);
  });
}
