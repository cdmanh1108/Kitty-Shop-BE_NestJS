import { RentalInvariantError } from './rental-errors';
import { RENTAL_STATUS } from './rental-status';

export interface RentalMonetaryState {
  status: string;
  hasSettlement: boolean;
  hasConfirmation?: boolean;
}

export interface RentalPaymentMutation {
  direction: string;
  purpose: string;
  source: string;
  receiptKey: string | null;
}

/**
 * Domain policy shared by monetary writers. Callers must obtain their state
 * inside the monetary transaction boundary; a pre-check is never authority.
 */
export function assertChargeMutationAllowed(state: RentalMonetaryState): void {
  if (state.status === RENTAL_STATUS.COMPLETED || state.status === RENTAL_STATUS.CANCELLED) {
    throw new RentalInvariantError(
      'ORDER_LOCKED',
      'Không thể thêm phụ phí cho đơn thuê đã đóng hoặc đã hủy.',
    );
  }
  if (state.hasSettlement) {
    throw new RentalInvariantError(
      'ORDER_ALREADY_SETTLED',
      'Không thể thêm phụ phí sau khi đã kết toán đơn thuê.',
    );
  }
}

export function assertSettlementAllowed(state: RentalMonetaryState): void {
  if (state.status !== RENTAL_STATUS.RETURNED) {
    throw new RentalInvariantError(
      'RENTAL_TRANSITION_NOT_ALLOWED',
      'Chỉ có thể kết toán đơn ở trạng thái đã nhận trả.',
    );
  }
  if (state.hasSettlement) {
    throw new RentalInvariantError('ORDER_ALREADY_SETTLED', 'Đơn thuê này đã được kết toán.');
  }
}

/**
 * A post-settlement ORDER_REFUND is an independent adjustment, not a rewrite
 * of the settlement snapshot. Other generic payment writes cannot alter a
 * finalized order's ledger.
 */
export function assertPaymentCreationAllowed(
  state: RentalMonetaryState,
  payment: Pick<RentalPaymentMutation, 'direction' | 'purpose'>,
): void {
  const isIndependentOrderRefund =
    payment.direction === 'OUT' && payment.purpose === 'ORDER_REFUND';
  if (state.status === RENTAL_STATUS.CANCELLED) {
    throw new RentalInvariantError(
      'PAYMENT_RECORD_LOCKED',
      'Không thể ghi giao dịch thanh toán cho đơn thuê đã hủy.',
    );
  }
  if (
    (state.status === RENTAL_STATUS.COMPLETED || state.hasSettlement) &&
    !isIndependentOrderRefund
  ) {
    throw new RentalInvariantError(
      'PAYMENT_RECORD_LOCKED',
      'Chỉ có thể ghi hoàn tiền đơn độc lập sau khi đã chốt đơn thuê.',
    );
  }
}

export function assertPaymentVoidAllowed(
  state: RentalMonetaryState,
  orderId: string,
  payment: RentalPaymentMutation,
): void {
  if (payment.source === 'INTERNAL_TRANSFER') {
    throw new RentalInvariantError(
      'PAYMENT_VOID_PROTECTED',
      'Không thể hủy giao dịch chuyển khoản nội bộ của quy trình kết toán.',
    );
  }
  if (isLifecycleReceipt(orderId, payment.receiptKey)) {
    throw new RentalInvariantError(
      'PAYMENT_VOID_PROTECTED',
      'Không thể hủy biên lai của quy trình xác nhận hoặc kết toán đơn thuê.',
    );
  }
  if (state.hasConfirmation) {
    throw new RentalInvariantError(
      'PAYMENT_VOID_PROTECTED',
      'Không thể hủy giao dịch sau khi đơn thuê đã được xác nhận.',
    );
  }
  if (state.hasSettlement || state.status === RENTAL_STATUS.COMPLETED) {
    throw new RentalInvariantError(
      'PAYMENT_VOID_PROTECTED',
      'Không thể hủy giao dịch đã tham gia kết toán đơn thuê.',
    );
  }
  if (state.status === RENTAL_STATUS.CANCELLED) {
    throw new RentalInvariantError(
      'PAYMENT_VOID_PROTECTED',
      'Không thể hủy giao dịch của đơn thuê đã hủy.',
    );
  }
}

function isLifecycleReceipt(orderId: string, receiptKey: string | null): boolean {
  return (
    receiptKey === `RC-R-${orderId}` ||
    receiptKey === `RC-D-${orderId}` ||
    receiptKey === `RS-F-${orderId}` ||
    receiptKey === `RS-C-${orderId}` ||
    receiptKey === `RS-D-${orderId}` ||
    receiptKey === `RS-R-${orderId}`
  );
}
