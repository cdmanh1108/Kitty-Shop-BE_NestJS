import type { CurrentUser } from '@common/types/current-user';
import type { PaginatedResult, PaginationParams } from '@common/types/pagination';
import type {
  PaymentAttempt,
  PaymentCloseReason,
  PaymentLink,
  PaymentOrderScope,
  VerifiedPaymentTransfer,
} from './payment';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
export type PaymentClaimMode = 'open' | 'sync' | 'reconcile';

export interface OrderPayment {
  cancelled: boolean;
  orderCode: string;
  cancelledAt: Date | null;
  attempt: PaymentAttempt | null;
}

export interface PaymentClaim {
  id: string;
  attempt: PaymentAttempt;
  firstCreate: boolean;
}

export interface PaymentTransferReview {
  id: string;
  orderCode: string | null;
  reference: string;
  amount: number;
  reason: string | null;
  paidAt: Date;
}

export interface PaymentReviewCase {
  id: string;
  kind: 'ATTEMPT' | 'TRANSFER';
  orderId: string | null;
  orderCode: string | null;
  reference: string;
  amount: number;
  reason: string | null;
  occurredAt: string;
}

export interface PaymentRepository {
  order(scope: PaymentOrderScope): Promise<OrderPayment | null>;
  due(now: Date, limit: number): Promise<PaymentOrderScope[]>;
  countOverdue(cutoff: Date): Promise<number>;
  claim(scope: PaymentOrderScope, now: Date, mode: PaymentClaimMode): Promise<PaymentClaim | null>;
  requestClose(scope: PaymentOrderScope, now: Date, reason: PaymentCloseReason): Promise<boolean>;
  finish(claim: PaymentClaim, now: Date, observation?: PaymentLink | null): Promise<void>;
  recordTransfer(shopId: string, transfer: VerifiedPaymentTransfer): Promise<void>;
  listReview(shopId: string, limit: number): Promise<PaymentTransferReview[]>;
  reviewQueue(shopId: string, page: PaginationParams): Promise<PaginatedResult<PaymentReviewCase>>;
  refundPaidReservation(
    actor: CurrentUser,
    orderId: string,
    refundReference: string,
    now: Date,
  ): Promise<boolean>;
  recordRefund(
    actor: CurrentUser,
    id: string,
    refundReference: string,
    now: Date,
  ): Promise<boolean>;
}
