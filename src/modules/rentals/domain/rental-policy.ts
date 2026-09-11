import { RENTAL_STATUS, type RentalStatus } from './rental-status';
import { InvalidRentalIntervalError } from './rental-errors';

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
  ACTIVE: [RENTAL_STATUS.RESERVED, RENTAL_STATUS.CONFIRMED],
  COMPLETED: [RENTAL_STATUS.ACTIVE],
  CANCELLED: [RENTAL_STATUS.RESERVED, RENTAL_STATUS.CONFIRMED],
} satisfies Record<'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED', RentalStatus[]>;
