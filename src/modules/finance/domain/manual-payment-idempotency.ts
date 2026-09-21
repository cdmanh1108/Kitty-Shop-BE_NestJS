import type { JsonValue } from '@common/types/json';
import type { PaymentTransactionRecord } from './finance.records';

export const FINANCE_MANUAL_PAYMENT_IDEMPOTENCY_SCOPE = 'finance.manual-payment.create.v1';
export const FINANCE_MANUAL_PAYMENT_REPLAY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class FinancePaymentClaimLostError extends Error {
  constructor() {
    super('Quyền xử lý receipt đã hết hạn hoặc được thay thế.');
  }
}

export type FinanceIdempotencyClaim =
  | { state: 'CLAIMED'; claimId: string }
  | { state: 'IN_PROGRESS' }
  | { state: 'HASH_MISMATCH' }
  | { state: 'COMPLETED'; responseBody: JsonValue };

export interface ManualPaymentCreateResult {
  id: string;
  orderId: string;
  customerId: string;
  transactionNumber: string;
  direction: string;
  purpose: string;
  paymentMethod: string;
  amount: string;
  status: string;
  paidAt: string;
}

interface StoredManualPaymentCreateResult {
  version: 1;
  kind: 'finance-manual-payment-create';
  result: ManualPaymentCreateResult;
}

export function toManualPaymentCreateResult(
  payment: PaymentTransactionRecord,
): ManualPaymentCreateResult {
  return {
    id: payment.id,
    orderId: payment.orderId,
    customerId: payment.customerId,
    transactionNumber: payment.transactionNumber,
    direction: payment.direction,
    purpose: payment.purpose,
    paymentMethod: payment.paymentMethod,
    amount: payment.amount.toString(),
    status: payment.status,
    paidAt: payment.paidAt.toISOString(),
  };
}

export function toStoredManualPaymentCreateResult(
  payment: PaymentTransactionRecord,
): StoredManualPaymentCreateResult {
  return {
    version: 1,
    kind: 'finance-manual-payment-create',
    result: toManualPaymentCreateResult(payment),
  };
}

export function isStoredManualPaymentCreateResult(
  value: JsonValue,
): value is JsonValue & StoredManualPaymentCreateResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as { [key: string]: JsonValue | undefined };
  const result = record.result;
  return (
    record.version === 1 &&
    record.kind === 'finance-manual-payment-create' &&
    Boolean(result) &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    [
      'id',
      'orderId',
      'customerId',
      'transactionNumber',
      'direction',
      'purpose',
      'paymentMethod',
      'amount',
      'status',
      'paidAt',
    ].every((key) => typeof (result as { [key: string]: JsonValue | undefined })[key] === 'string')
  );
}
