import { ApplicationError } from '@common/errors/application-error';

export const OPEN_PAYMENT_STATES = ['NEW', 'CREATING', 'PENDING', 'REVIEW'] as const;
export type PaymentState = (typeof OPEN_PAYMENT_STATES)[number] | 'PAID' | 'CLOSED';
export type PaymentCloseReason = 'EXPIRED' | 'CANCELLED';

export interface VerifiedPaymentTransfer {
  orderCode: number;
  linkId: string;
  reference: string;
  amount: number;
  paidAt: Date;
}

export interface PaymentLink {
  orderCode: number;
  linkId: string;
  amount: number;
  status: 'PENDING' | 'CANCELLED' | 'UNDERPAID' | 'PAID' | 'EXPIRED' | 'PROCESSING' | 'FAILED';
  amountPaid: number;
  transfers: VerifiedPaymentTransfer[];
  checkoutUrl?: string;
}

export interface PaymentAttempt {
  orderId: string;
  shopId: string;
  returnPath: string;
  orderCode: number;
  chargeAmount: number;
  depositAmount: number;
  state: PaymentState;
  linkId: string | null;
  checkoutUrl: string | null;
  expiresAt: Date;
  closeReason: PaymentCloseReason | null;
  closeRequested: boolean;
  reviewReason: string | null;
}

export type PaymentOrderScope =
  | { shopId: string; orderId: string; orderCode?: never; webAccountId?: never }
  | { shopId: string; orderId?: never; orderCode: string; webAccountId: string };

export interface CreatePaymentLink {
  orderCode: number;
  amount: number;
  expiresAt: Date;
  returnPath: string;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
export interface PaymentGateway {
  readonly checkout: {
    enabled: boolean;
    configured: boolean;
    ttlMinutes: number;
  };
  create(input: CreatePaymentLink): Promise<PaymentLink>;
  read(orderCode: number): Promise<PaymentLink | null>;
  cancel(orderCode: number): Promise<PaymentLink>;
}

export class PaymentUnavailableError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;
  constructor(code: string, message: string) {
    super(message, code);
  }
}

export function assertWholeVnd(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new PaymentUnavailableError(
      'PAYOS_INVALID_AMOUNT',
      'Số tiền chuyển qua payOS phải là số nguyên đồng.',
    );
}
