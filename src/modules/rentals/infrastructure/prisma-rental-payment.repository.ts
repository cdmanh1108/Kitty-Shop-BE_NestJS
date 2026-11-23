import { rentalLedger } from './rental-ledger';
import { randomUUID } from 'node:crypto';
import type { Clock } from '@common/clock/clock';
import { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { writeTransactionalAuditLog } from '@modules/audit/public/transactional-audit';
import { restoreUnpaidWebRentalReward } from '@modules/customers/public/rental-loyalty-transaction';
import { recomputeOrderPaymentState } from '@modules/finance/public/order-payment-state-transaction';
import { recordRentalReceipt } from '@modules/finance/public/rental-receipt-transaction';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  PaymentClaim,
  PaymentClaimMode,
  PaymentRepository,
} from '@modules/payments/public/payment-repository';
import {
  OPEN_PAYMENT_STATES,
  PaymentUnavailableError,
  type PaymentAttempt,
  type PaymentCloseReason,
  type PaymentLink,
  type PaymentOrderScope,
  type PaymentState,
  type VerifiedPaymentTransfer,
} from '@modules/payments/public/hosted-payment';
import { lockRentalOrder } from './rental-order-lock';
import { transitionWithTx } from './rental-transition.lifecycle';

const CLAIM_MS = 30_000;
const RETRY_MS = 45_000;
const PAID_CHECK_MS = 75_000;
const CLOSED_LINKS = new Set(['CANCELLED', 'EXPIRED', 'FAILED']);
const attemptInclude = {
  order: {
    select: {
      shopId: true,
      orderNumber: true,
      status: true,
      customerId: true,
      grandTotal: true,
      depositRequired: true,
    },
  },
} as const;
type AttemptRow = Prisma.RentalPayosAttemptGetPayload<{ include: typeof attemptInclude }>;

function attemptView(row: AttemptRow): PaymentAttempt {
  return {
    orderId: row.orderId,
    shopId: row.order.shopId,
    returnPath: '/dat-thue/thanh-toan/' + encodeURIComponent(row.order.orderNumber),
    orderCode: Number(row.orderCode),
    chargeAmount: row.rentalAmount.toNumber(),
    depositAmount: row.depositAmount.toNumber(),
    state: row.state as PaymentState,
    linkId: row.providerLinkId,
    checkoutUrl: row.checkoutUrl,
    expiresAt: row.expiresAt,
    closeRequested: row.closeReason !== null && row.state !== 'CLOSED',
    closeReason: row.closeReason as PaymentCloseReason | null,
    reviewReason: row.reviewReason,
  };
}

function scopeFilter(scope: PaymentOrderScope): Prisma.RentalOrderWhereInput {
  return {
    shopId: scope.shopId,
    id: scope.orderId,
    orderNumber: scope.orderCode,
    webAccountId: scope.webAccountId,
  };
}

function scopedAttempt(tx: Prisma.TransactionClient, scope: PaymentOrderScope) {
  return tx.rentalPayosAttempt.findFirst({
    where: { order: scopeFilter(scope) },
    include: attemptInclude,
  });
}

async function lockAttempt(tx: Prisma.TransactionClient, scope: PaymentOrderScope) {
  const row = await scopedAttempt(tx, scope);
  if (!row || !(await lockRentalOrder(tx, { shopId: scope.shopId, orderId: row.orderId })))
    return null;
  return scopedAttempt(tx, scope);
}

function hasRemainingPayments(tx: Prisma.TransactionClient, orderId: string) {
  return tx.paymentTransaction.count({ where: { orderId, status: 'COMPLETED', voidedAt: null } });
}

@Injectable()
export class PrismaRentalPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async order(scope: PaymentOrderScope) {
    const order = await this.prisma.rentalOrder.findFirst({
      where: scopeFilter(scope),
      select: {
        status: true,
        orderNumber: true,
        cancelledAt: true,
        payosAttempt: { include: attemptInclude },
      },
    });
    return order
      ? {
          cancelled: order.status === 'CANCELLED',
          orderCode: order.orderNumber,
          cancelledAt: order.cancelledAt,
          attempt: order.payosAttempt ? attemptView(order.payosAttempt) : null,
        }
      : null;
  }

  async due(now: Date, limit: number) {
    const rows = await this.prisma.rentalPayosAttempt.findMany({
      where: { state: { in: [...OPEN_PAYMENT_STATES] }, nextCheckAt: { lte: now } },
      select: { orderId: true, order: { select: { shopId: true } } },
      orderBy: { nextCheckAt: 'asc' },
      take: limit,
    });
    return rows.map(({ orderId, order }) => ({ orderId, shopId: order.shopId }));
  }

  countOverdue(cutoff: Date) {
    return this.prisma.rentalPayosAttempt.count({
      where: { state: { in: [...OPEN_PAYMENT_STATES] }, expiresAt: { lte: cutoff } },
    });
  }

  claim(scope: PaymentOrderScope, now: Date, mode: PaymentClaimMode) {
    return serializableTransaction(this.prisma, async (tx) => {
      const row = await lockAttempt(tx, scope);
      if (
        !row ||
        row.order.status !== 'RESERVED' ||
        row.state === 'PAID' ||
        row.state === 'CLOSED' ||
        (row.claimUntil && row.claimUntil > now)
      )
        return null;
      if (
        mode === 'open' &&
        (row.expiresAt <= now ||
          row.closeReason ||
          row.checkoutUrl ||
          row.state === 'REVIEW' ||
          (row.state === 'CREATING' && row.nextCheckAt > now))
      )
        return null;
      if (mode === 'sync' && row.nextCheckAt > now) return null;

      const firstCreate = mode === 'open' && row.state === 'NEW';
      const id = randomUUID();
      const closeReason = row.closeReason ?? (row.expiresAt <= now ? 'EXPIRED' : null);
      const updated = await tx.rentalPayosAttempt.update({
        where: { orderId: row.orderId },
        data: {
          state: firstCreate ? 'CREATING' : row.state,
          closeReason,
          claimId: id,
          claimUntil: new Date(now.getTime() + CLAIM_MS),
          ...(firstCreate
            ? { nextCheckAt: new Date(Math.min(row.expiresAt.getTime(), now.getTime() + CLAIM_MS)) }
            : {}),
        },
        include: attemptInclude,
      });
      return { id, firstCreate, attempt: attemptView(updated) };
    });
  }

  requestClose(scope: PaymentOrderScope, now: Date, reason: PaymentCloseReason) {
    return serializableTransaction(this.prisma, async (tx) => {
      const row = await lockAttempt(tx, scope);
      if (
        !row ||
        row.order.status !== 'RESERVED' ||
        row.state === 'PAID' ||
        row.state === 'CLOSED' ||
        row.state === 'REVIEW'
      )
        return false;
      await tx.rentalPayosAttempt.update({
        where: { orderId: row.orderId },
        data: { closeReason: row.closeReason ?? reason, nextCheckAt: now },
      });
      return true;
    });
  }

  finish(claim: PaymentClaim, now: Date, observation?: PaymentLink | null): Promise<void> {
    const { orderId, shopId } = claim.attempt;
    return serializableTransaction(this.prisma, async (tx) => {
      let row = await lockAttempt(tx, { orderId, shopId });
      if (row?.claimId !== claim.id) return;

      const nextCheckAt = new Date(
        now.getTime() + (observation === undefined ? RETRY_MS : PAID_CHECK_MS),
      );
      const reportDueAt =
        row.closeReason || row.expiresAt <= now
          ? nextCheckAt
          : new Date(Math.min(nextCheckAt.getTime(), row.expiresAt.getTime()));
      const release = { claimId: null, claimUntil: null, nextCheckAt: reportDueAt };

      if (
        observation &&
        (observation.orderCode !== Number(row.orderCode) ||
          !row.rentalAmount.plus(row.depositAmount).equals(observation.amount) ||
          (row.providerLinkId && row.providerLinkId !== observation.linkId))
      ) {
        if (row.state !== 'PAID')
          await tx.rentalPayosAttempt.update({
            where: { orderId },
            data: { ...release, state: 'REVIEW', reviewReason: 'LINK_MISMATCH' },
          });
        return;
      }

      if (observation) {
        row = await tx.rentalPayosAttempt.update({
          where: { orderId },
          data: { providerLinkId: observation.linkId, checkoutUrl: observation.checkoutUrl },
          include: attemptInclude,
        });
        // An exact, single transfer is the automatic settlement contract. Split or excess credits
        // remain visible for manual review even when the provider reports the link as paid.
        const acceptExact =
          observation.status === 'PAID' &&
          observation.amountPaid === observation.amount &&
          observation.transfers.length === 1;
        for (const transfer of observation.transfers) {
          await this.recordTransferWithTx(tx, shopId, transfer, acceptExact);
        }
        row = await tx.rentalPayosAttempt.findUniqueOrThrow({
          where: { orderId },
          include: attemptInclude,
        });
      }

      const reviewCount = await tx.payosTransfer.count({ where: { orderId, state: 'REVIEW' } });
      const refundAggregate = await tx.payosTransfer.aggregate({
        where: { orderId, state: 'REFUNDED', providerLinkId: row.providerLinkId ?? '' },
        _sum: { amount: true },
      });
      const refundedAmount = refundAggregate._sum.amount ?? new Prisma.Decimal(0);
      const providerClosed = observation
        ? CLOSED_LINKS.has(observation.status) ||
          (observation.status === 'PAID' && refundedAmount.greaterThan(0))
        : observation === null && !row.providerLinkId;
      const providerCleared = observation
        ? refundedAmount.equals(observation.amountPaid)
        : providerClosed;

      if (
        row.closeReason &&
        providerClosed &&
        providerCleared &&
        !reviewCount &&
        row.state !== 'PAID'
      ) {
        if (await this.closeOrder(tx, row, now)) return;
      }

      const needsReview =
        observation &&
        observation.amountPaid > 0 &&
        row.state !== 'PAID' &&
        !refundedAmount.equals(observation.amountPaid);
      const naturallyClosed =
        observation && CLOSED_LINKS.has(observation.status) && providerCleared && !reviewCount;
      if (!row.closeReason && naturallyClosed && row.state !== 'PAID') {
        const reminder = await tx.rentalPayosAttempt.update({
          where: { orderId },
          data: { closeReason: observation.status === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED' },
          include: attemptInclude,
        });
        if (await this.closeOrder(tx, reminder, now)) return;
      }
      const state =
        row.state === 'PAID' || row.state === 'REVIEW'
          ? row.state
          : needsReview
            ? 'REVIEW'
            : observation
              ? 'PENDING'
              : row.state;
      await tx.rentalPayosAttempt.update({
        where: { orderId },
        data: {
          ...release,
          state,
          ...(needsReview && !row.reviewReason ? { reviewReason: 'INCOMPLETE_PROVIDER_DATA' } : {}),
        },
      });
    });
  }

  private async closeOrder(tx: Prisma.TransactionClient, row: AttemptRow, now: Date) {
    const {
      orderId,
      order: { shopId },
      closeReason,
    } = row;
    if (await hasRemainingPayments(tx, orderId)) return false;
    const clock: Clock = { now: () => now };
    const result = await transitionWithTx(
      tx,
      {
        orderId,
        shopId,
        expectedSource: 'ONLINE',
        requireNoCompletedPayments: true,
        fromStatuses: ['RESERVED'],
        toStatus: 'CANCELLED',
        reason: closeReason === 'EXPIRED' ? 'PAYOS_PAYMENT_EXPIRED' : 'PAYOS_PAYMENT_CANCELLED',
      },
      clock,
      true,
    );
    if (!result) return false;
    await restoreUnpaidWebRentalReward(tx, shopId, orderId);
    await tx.rentalPayosAttempt.update({
      where: { orderId },
      data: { state: 'CLOSED', claimId: null, claimUntil: null, reviewReason: null },
    });
    await writeTransactionalAuditLog(tx, {
      shopId,
      action: 'PAYOS_RESERVATION_CLOSED',
      entityType: 'rental_order',
      entityId: orderId,
      newValues: { reason: closeReason },
    });
    return true;
  }

  recordTransfer(shopId: string, transfer: VerifiedPaymentTransfer) {
    return serializableTransaction(this.prisma, (tx) =>
      this.recordTransferWithTx(tx, shopId, transfer, true),
    );
  }

  private async recordTransferWithTx(
    tx: Prisma.TransactionClient,
    shopId: string,
    transfer: VerifiedPaymentTransfer,
    acceptExact: boolean,
  ) {
    const known = await tx.rentalPayosAttempt.findFirst({
      where: { orderCode: BigInt(transfer.orderCode), order: { shopId } },
      select: { orderId: true },
    });
    const row = known ? await lockAttempt(tx, { shopId, orderId: known.orderId }) : null;
    const reason = await this.transferReviewReason(tx, row, transfer, acceptExact);
    const id = randomUUID();
    const recorded = await tx.payosTransfer.createMany({
      data: [
        {
          id,
          shopId,
          orderId: row?.orderId,
          providerOrderCode: BigInt(transfer.orderCode),
          providerLinkId: transfer.linkId,
          reference: transfer.reference,
          amount: transfer.amount,
          paidAt: transfer.paidAt,
          state: reason ? 'REVIEW' : 'APPLIED',
          reason,
        },
      ],
      skipDuplicates: true,
    });
    if (recorded.count === 0) return;

    if (reason || !row) {
      if (row && (OPEN_PAYMENT_STATES as readonly string[]).includes(row.state)) {
        await tx.rentalPayosAttempt.update({
          where: { orderId: row.orderId },
          data: { state: 'REVIEW', reviewReason: reason },
        });
      }
    } else {
      for (const [purpose, amount] of [
        ['RENTAL_PAYMENT', row.rentalAmount],
        ['DEPOSIT', row.depositAmount],
      ] as const) {
        await recordRentalReceipt(tx, {
          shopId,
          orderId: row.orderId,
          customerId: row.order.customerId,
          key: 'PO-' + id + '-' + purpose[0],
          providerTransactionId: transfer.reference + ':' + purpose,
          bankReference: transfer.reference,
          purpose,
          amount,
          source: 'PAYOS',
          direction: 'IN',
          paymentMethod: 'BANK_TRANSFER',
          paidAt: transfer.paidAt,
        });
      }
      await recomputeOrderPaymentState(tx, row.orderId);
      await tx.rentalPayosAttempt.update({
        where: { orderId: row.orderId },
        data: {
          state: 'PAID',
          providerLinkId: transfer.linkId,
          closeReason: null,
          reviewReason: null,
        },
      });
      await tx.outboxEvent.create({
        data: {
          shopId,
          eventType: 'RENTAL_PAYOS_PAYMENT_RECORDED',
          aggregateType: 'rental_order',
          aggregateId: row.orderId,
          payload: { orderId: row.orderId, transferId: id },
        },
      });
    }
    await writeTransactionalAuditLog(tx, {
      shopId,
      action: reason ? 'PAYOS_TRANSFER_NEEDS_REVIEW' : 'PAYOS_PAYMENT_RECORDED',
      entityType: 'payos_transfer',
      entityId: id,
      newValues: {
        orderId: row?.orderId,
        amount: transfer.amount,
        reference: transfer.reference,
        reason,
      },
    });
  }

  private async transferReviewReason(
    tx: Prisma.TransactionClient,
    row: AttemptRow | null,
    transfer: VerifiedPaymentTransfer,
    acceptExact: boolean,
  ) {
    if (!row) return 'UNKNOWN_ORDER';
    if (row.state === 'PAID') return 'EXTRA_TRANSFER';
    if (row.state === 'CLOSED' || row.order.status !== 'RESERVED') return 'CLOSED_RENTAL';
    if (transfer.paidAt > row.expiresAt) return 'LATE_TRANSFER';
    if (row.state === 'NEW' || (row.providerLinkId && row.providerLinkId !== transfer.linkId))
      return 'LINK_MISMATCH';
    if (!acceptExact || !row.rentalAmount.plus(row.depositAmount).equals(transfer.amount))
      return 'AMOUNT_MISMATCH';
    if (
      !row.rentalAmount.equals(row.order.grandTotal) ||
      !row.depositAmount.equals(row.order.depositRequired)
    )
      return 'ORDER_TOTAL_CHANGED';
    if (await hasRemainingPayments(tx, row.orderId)) return 'EXISTING_RECEIPTS';
    if (await tx.payosTransfer.count({ where: { orderId: row.orderId, state: 'REVIEW' } }))
      return 'OPEN_REVIEW';
    return null;
  }

  async listReview(shopId: string, limit: number) {
    const items = await this.prisma.payosTransfer.findMany({
      where: { shopId, state: 'REVIEW' },
      orderBy: { paidAt: 'asc' },
      take: limit,
      select: {
        id: true,
        amount: true,
        paidAt: true,
        reference: true,
        reason: true,
        order: { select: { orderNumber: true } },
      },
    });
    return items.map((item) => ({
      id: item.id,
      amount: item.amount.toNumber(),
      paidAt: item.paidAt,
      reference: item.reference,
      reason: item.reason,
      orderCode: item.order?.orderNumber ?? null,
    }));
  }

  async recordRefund(
    actor: Parameters<PaymentRepository['recordRefund']>[0],
    id: string,
    refundReference: string,
    now: Date,
  ) {
    return serializableTransaction(this.prisma, async (tx) => {
      const transfer = await tx.payosTransfer.findFirst({ where: { id, shopId: actor.shopId } });
      if (!transfer) return false;
      if (transfer.orderId)
        await lockRentalOrder(tx, { shopId: actor.shopId, orderId: transfer.orderId });
      if (transfer.state === 'REFUNDED' && transfer.refundReference === refundReference)
        return true;
      const updated = await tx.payosTransfer.updateMany({
        where: { id, shopId: actor.shopId, state: 'REVIEW' },
        data: { state: 'REFUNDED', resolvedAt: now, refundReference },
      });
      if (updated.count === 0) return false;
      if (transfer.orderId) {
        const left = await tx.payosTransfer.count({
          where: { orderId: transfer.orderId, state: 'REVIEW' },
        });
        if (!left)
          await tx.rentalPayosAttempt.updateMany({
            where: { orderId: transfer.orderId, state: 'REVIEW' },
            data: { closeReason: 'CANCELLED', nextCheckAt: now },
          });
      }
      await writeTransactionalAuditLog(tx, {
        shopId: actor.shopId,
        actorUserId: actor.userId,
        actorMemberId: actor.memberId,
        action: 'PAYOS_REVIEW_REFUNDED',
        entityType: 'payos_transfer',
        entityId: id,
        newValues: { refundReference, amount: transfer.amount.toString() },
      });
      return true;
    });
  }

  refundPaidReservation(
    actor: Parameters<PaymentRepository['refundPaidReservation']>[0],
    orderId: string,
    refundReference: string,
    now: Date,
  ) {
    return serializableTransaction(this.prisma, async (tx) => {
      const row = await lockAttempt(tx, { orderId, shopId: actor.shopId });
      if (!row) return false;
      if (row.state === 'CLOSED' && row.order.status === 'CANCELLED') {
        return Boolean(
          await tx.payosTransfer.findFirst({
            where: { orderId, refundReference, state: 'REFUNDED' },
          }),
        );
      }
      if (row.state !== 'PAID' || row.order.status !== 'RESERVED') return false;
      if (await tx.payosTransfer.count({ where: { orderId, state: 'REVIEW' } })) return false;
      const transfer = await tx.payosTransfer.findFirst({ where: { orderId, state: 'APPLIED' } });
      if (!transfer) return false;
      const ledger = rentalLedger(
        await tx.paymentTransaction.findMany({
          where: { orderId, status: 'COMPLETED', voidedAt: null },
          select: { amount: true, purpose: true, direction: true },
        }),
      );
      if (
        !ledger.paidRental.equals(row.rentalAmount) ||
        !ledger.depositHeld.equals(row.depositAmount)
      )
        return false;

      for (const [purpose, amount] of [
        ['ORDER_REFUND', row.rentalAmount],
        ['DEPOSIT_REFUND', row.depositAmount],
      ] as const) {
        await recordRentalReceipt(tx, {
          orderId,
          shopId: actor.shopId,
          customerId: row.order.customerId,
          actorMemberId: actor.memberId,
          key: 'PR-' + transfer.id + '-' + purpose[0],
          bankReference: refundReference,
          purpose,
          amount,
          direction: 'OUT',
          paymentMethod: 'BANK_TRANSFER',
          paidAt: now,
        });
      }
      await recomputeOrderPaymentState(tx, orderId);
      const result = await transitionWithTx(
        tx,
        {
          orderId,
          shopId: actor.shopId,
          expectedSource: 'ONLINE',
          fromStatuses: ['RESERVED'],
          toStatus: 'CANCELLED',
          changedBy: actor.memberId,
          reason: 'PAYOS_REFUNDED',
        },
        { now: () => now },
        true,
      );
      if (!result)
        throw new PaymentUnavailableError(
          'PAYOS_REFUND_ORDER_CHANGED',
          'Đơn vừa thay đổi. Hãy kiểm tra trước khi ghi nhận hoàn tiền.',
        );
      await tx.payosTransfer.update({
        where: { id: transfer.id },
        data: { state: 'REFUNDED', resolvedAt: now, refundReference },
      });
      await tx.rentalPayosAttempt.update({
        where: { orderId },
        data: { state: 'CLOSED', closeReason: 'CANCELLED', reviewReason: null },
      });
      await writeTransactionalAuditLog(tx, {
        shopId: actor.shopId,
        actorUserId: actor.userId,
        actorMemberId: actor.memberId,
        action: 'PAYOS_ORDER_REFUNDED_AND_CANCELLED',
        entityType: 'rental_order',
        entityId: orderId,
        newValues: { refundReference, transferId: transfer.id },
      });
      return true;
    });
  }
}
