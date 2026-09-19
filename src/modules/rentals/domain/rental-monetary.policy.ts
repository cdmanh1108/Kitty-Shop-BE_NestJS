import { RentalInvariantError } from './rental-errors';
import { RENTAL_STATUS } from './rental-status';

export interface RentalMonetaryState {
  status: string;
  hasSettlement: boolean;
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
