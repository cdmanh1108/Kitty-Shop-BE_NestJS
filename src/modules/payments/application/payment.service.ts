import { CLOCK, type Clock } from '@common/clock/clock';
import type { CurrentUser } from '@common/types/current-user';
import { ApplicationError } from '@common/errors/application-error';
import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type OrderPayment,
  type PaymentRepository,
} from '../domain/payment.repository';
import {
  PAYMENT_GATEWAY,
  PaymentUnavailableError,
  type PaymentGateway,
  type PaymentLink,
  type PaymentOrderScope,
  type VerifiedPaymentTransfer,
} from '../domain/payment';

export const PAYMENT_STATUS = [
  'NOT_REQUIRED',
  'UNAVAILABLE',
  'READY',
  'PROCESSING',
  'PENDING',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'REVIEW',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];
export interface PaymentSummary {
  status: PaymentStatus;
  checkoutUrl: string | null;
  canOpen: boolean;
  chargeAmount: number;
  depositAmount: number;
  expiresAt: string | null;
}

class PaymentOrderNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly repository: PaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  checkoutEnabled() {
    return this.gateway.checkout.enabled;
  }

  isConfigured() {
    return this.gateway.checkout.configured;
  }

  async get(scope: PaymentOrderScope) {
    return this.present(await this.findOrder(scope));
  }

  async open(scope: PaymentOrderScope) {
    const current = await this.findOrder(scope);
    const status = this.present(current);
    if (!status.canOpen || status.checkoutUrl) return status;
    const claim = await this.repository.claim(scope, this.clock.now(), 'open');
    if (!claim) return this.get(scope);
    const { attempt } = claim;
    const input = {
      orderCode: attempt.orderCode,
      amount: attempt.chargeAmount + attempt.depositAmount,
      expiresAt: attempt.expiresAt,
      returnPath: attempt.returnPath,
    };
    let result: PaymentLink | undefined;
    try {
      result = claim.firstCreate
        ? await this.gateway.create(input)
        : ((await this.gateway.read(input.orderCode)) ?? (await this.gateway.create(input)));
    } catch {
      // A write may have succeeded remotely. The persisted order code is used for the next lookup.
    }
    await this.repository.finish(claim, this.clock.now(), result);
    return this.get(scope);
  }

  async sync(scope: PaymentOrderScope, mode: 'sync' | 'reconcile' = 'sync') {
    const claim = await this.repository.claim(scope, this.clock.now(), mode);
    if (!claim) return;
    let result: PaymentLink | null | undefined;
    try {
      const { attempt } = claim;
      result = attempt.state === 'NEW' ? null : await this.gateway.read(attempt.orderCode);
      if (attempt.closeRequested && result && ['PENDING', 'UNDERPAID'].includes(result.status)) {
        if (
          result.orderCode === attempt.orderCode &&
          result.amount === attempt.chargeAmount + attempt.depositAmount &&
          (!attempt.linkId || result.linkId === attempt.linkId)
        ) {
          try {
            result = await this.gateway.cancel(attempt.orderCode);
          } catch {
            // Preserve the verified observation. The next lookup decides whether cancel succeeded.
          }
        }
      }
    } catch {
      // Release the short claim and defer the next provider lookup.
    }
    await this.repository.finish(claim, this.clock.now(), result);
  }

  async syncDue(assertActive: () => void) {
    for (const scope of await this.repository.due(this.clock.now(), 8)) {
      assertActive();
      await this.sync(scope);
    }
    assertActive();
    return this.repository.countOverdue(new Date(this.clock.now().getTime() - 5 * 60_000));
  }

  async cancelIfHosted(scope: PaymentOrderScope) {
    const order = await this.repository.order(scope);
    if (!order?.attempt) return null;
    if (order.attempt.state === 'CLOSED' && order.cancelledAt)
      return { orderCode: order.orderCode, cancelledAt: order.cancelledAt };
    if (!(await this.repository.requestClose(scope, this.clock.now(), 'CANCELLED'))) {
      throw new PaymentUnavailableError(
        'PAYOS_CANCEL_REQUIRES_REVIEW',
        'Đơn có giao dịch payOS. Vui lòng kiểm tra thanh toán trước khi hủy.',
      );
    }
    await this.sync(scope);
    const current = await this.findOrder(scope);
    if (current.attempt?.state === 'CLOSED' && current.cancelledAt)
      return { orderCode: current.orderCode, cancelledAt: current.cancelledAt };
    if (current.attempt?.state === 'PAID' || current.attempt?.state === 'REVIEW')
      throw new PaymentUnavailableError(
        'PAYOS_CANCEL_REQUIRES_REVIEW',
        'Đơn có giao dịch payOS. Vui lòng kiểm tra thanh toán trước khi hủy.',
      );
    throw new PaymentUnavailableError(
      'PAYOS_CANCEL_PENDING',
      'KITTY đang kiểm tra giao dịch để hủy đơn. Vui lòng kiểm tra lại sau ít phút.',
    );
  }

  recordTransfer(shopId: string, transfer: VerifiedPaymentTransfer) {
    return this.repository.recordTransfer(shopId, transfer);
  }

  listReview(shopId: string) {
    return this.repository.listReview(shopId, 100);
  }

  async recordRefund(actor: CurrentUser, id: string, refundReference: string) {
    if (!(await this.repository.recordRefund(actor, id, refundReference, this.clock.now())))
      throw new PaymentUnavailableError(
        'PAYOS_REVIEW_CHANGED',
        'Giao dịch đã được cập nhật hoặc không còn chờ đối soát.',
      );
  }

  async refundPaidReservation(actor: CurrentUser, orderId: string, refundReference: string) {
    if (
      !(await this.repository.refundPaidReservation(
        actor,
        orderId,
        refundReference,
        this.clock.now(),
      ))
    )
      throw new PaymentUnavailableError(
        'PAYOS_REFUND_REQUIRES_REVIEW',
        'Đơn không còn đủ điều kiện ghi nhận hoàn và hủy. Hãy kiểm tra giao dịch và trạng thái đơn.',
      );
  }

  private async findOrder(scope: PaymentOrderScope): Promise<OrderPayment> {
    const order = await this.repository.order(scope);
    if (!order) throw new PaymentOrderNotFoundError('Không tìm thấy đơn thuê.');
    return order;
  }

  private present({ attempt, cancelled }: OrderPayment): PaymentSummary {
    let status: PaymentStatus = 'NOT_REQUIRED';
    let checkoutUrl: string | null = null;
    let canOpen = false;
    if (attempt) {
      const validWindow = !attempt.closeRequested && attempt.expiresAt > this.clock.now();
      if (attempt.state === 'PAID') status = 'PAID';
      else if (attempt.state === 'REVIEW') status = 'REVIEW';
      else if (attempt.state === 'CLOSED' || cancelled)
        status = attempt.closeReason === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED';
      else if (!validWindow) status = 'PROCESSING';
      else if (attempt.checkoutUrl && attempt.state === 'PENDING') {
        status = 'PENDING';
        checkoutUrl = attempt.checkoutUrl;
        canOpen = true;
      } else if (attempt.state === 'NEW') {
        status = this.checkoutEnabled() ? 'READY' : 'UNAVAILABLE';
        canOpen = this.checkoutEnabled();
      } else {
        status = 'PROCESSING';
        canOpen = this.checkoutEnabled();
      }
    }
    return {
      status,
      checkoutUrl,
      canOpen,
      chargeAmount: attempt?.chargeAmount ?? 0,
      depositAmount: attempt?.depositAmount ?? 0,
      expiresAt: attempt?.expiresAt.toISOString() ?? null,
    };
  }
}
