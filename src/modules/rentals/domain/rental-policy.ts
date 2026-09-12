import { RENTAL_STATUS, type RentalStatus } from './rental-status';
import { InvalidRentalIntervalError, RentalInvariantError } from './rental-errors';

export function calculateRentalDurationDays(start: Date, end: Date): number {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new InvalidRentalIntervalError();
  }
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

export function canRescheduleRental(status: string): boolean {
  return status === RENTAL_STATUS.RESERVED || status === RENTAL_STATUS.CONFIRMED;
}

export const RENTAL_TRANSITION_FROM = {
  CONFIRMED: [RENTAL_STATUS.RESERVED],
  ACTIVE: [RENTAL_STATUS.CONFIRMED],
  COMPLETED: [RENTAL_STATUS.ACTIVE],
  CANCELLED: [RENTAL_STATUS.RESERVED],
} satisfies Record<'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED', RentalStatus[]>;

export function canTransitionRental(from: string, to: RentalStatus): boolean {
  const transitions: Partial<Record<RentalStatus, readonly string[]>> = RENTAL_TRANSITION_FROM;
  return transitions[to]?.includes(from) ?? false;
}

/** Revalidate against the persisted order inside the allocation transaction. */
export function assertRentalReschedule(input: {
  createdAt: Date;
  rentalStartAt: Date;
  rentalEndAt: Date;
  from: Date;
  until: Date;
  maxDaysFromBooking: number;
}): void {
  const duration = calculateRentalDurationDays(input.from, input.until);
  if (duration !== calculateRentalDurationDays(input.rentalStartAt, input.rentalEndAt)) {
    throw new RentalInvariantError(
      'RENTAL_REPRICING_REQUIRED',
      'Thay đổi số ngày thuê cần tính lại giá.',
    );
  }
  // createdAt is the original booking instant; rescheduling never moves this anchor.
  const deadline = input.createdAt.getTime() + input.maxDaysFromBooking * 86_400_000;
  if (input.from.getTime() < input.createdAt.getTime() || input.from.getTime() > deadline) {
    throw new RentalInvariantError(
      'RESCHEDULE_LIMIT_EXCEEDED',
      'Ngày bắt đầu thuê mới vượt quá thời hạn đổi lịch cho phép.',
    );
  }
}
