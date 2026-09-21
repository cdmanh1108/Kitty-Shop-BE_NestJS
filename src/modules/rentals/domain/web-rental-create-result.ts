import type { JsonValue } from '@common/types/json';
import type { RentalOrderDetails } from './rental.models';

/** Public-safe snapshot persisted for a completed Web create-order claim. */
export interface WebRentalCreateResult {
  orderCode: string;
  totalAmount: number;
  depositAmount: number;
  status: string;
  paymentStatus: string;
}

export interface StoredWebRentalCreateResult {
  version: 1;
  kind: 'web-rental-order-create';
  result: WebRentalCreateResult;
}

export function toWebRentalCreateResult(
  order: NonNullable<RentalOrderDetails>,
): WebRentalCreateResult {
  return {
    orderCode: order.orderNumber,
    totalAmount: Number(order.grandTotal),
    depositAmount: Number(order.depositRequired),
    status: order.status.toLowerCase(),
    paymentStatus: (order.paymentStatus || 'UNPAID').toLowerCase(),
  };
}

export function isStoredWebRentalCreateResult(
  value: JsonValue,
): value is JsonValue & StoredWebRentalCreateResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, JsonValue | undefined>;
  const result = record.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  const response = result as Record<string, JsonValue | undefined>;
  return (
    record.version === 1 &&
    record.kind === 'web-rental-order-create' &&
    typeof response.orderCode === 'string' &&
    typeof response.totalAmount === 'number' &&
    typeof response.depositAmount === 'number' &&
    typeof response.status === 'string' &&
    typeof response.paymentStatus === 'string'
  );
}
