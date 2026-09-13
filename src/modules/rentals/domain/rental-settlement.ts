export interface RentalSettlement {
  depositReceived: string;
  refundAmount: string;
  amountStillDue: string;
  settlementStatus: 'PENDING' | 'REFUND_DUE' | 'AMOUNT_DUE' | 'BALANCED';
}

function cents(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error('Số tiền không hợp lệ.');
  const amount = BigInt(match[2]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -amount : amount;
}

function money(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

export function calculateLateCharges(input: {
  dueAt: Date;
  returnedAt: Date;
  itemCount: number;
  rentalSubtotal: string;
  policy: RentalPolicy;
}): { lateDays: number; lateFee: string; additionalRental: string } {
  const lateDays = Math.max(
    0,
    Math.ceil((input.returnedAt.getTime() - input.dueAt.getTime()) / 86_400_000),
  );
  const lateFee =
    BigInt(lateDays) *
    BigInt(input.itemCount) *
    cents(input.policy.lateReturn.feePerItemPerDay.toString());
  return {
    lateDays,
    lateFee: money(lateFee),
    additionalRental: money(
      lateDays >= input.policy.lateReturn.newRentalChargeFromLateDay
        ? cents(input.rentalSubtotal)
        : 0n,
    ),
  };
}

export function rewardForCompletedRental(completedBefore: number, policy: RentalPolicy): number {
  if (!policy.loyalty.enabled) return 0;
  if (!Number.isSafeInteger(completedBefore) || completedBefore < 0)
    throw new RentalInvariantError(
      'INVALID_LOYALTY_PROGRESS',
      'Số lượt thuê đã hoàn thành không hợp lệ.',
    );
  return (completedBefore + 1) % policy.loyalty.rentalsRequired === 0
    ? policy.loyalty.rewardRentalValue
    : 0;
}

export function calculateRentalSettlement(input: {
  completed: boolean;
  grandTotal: string;
  paidRental: string;
  depositIn: string;
  depositOut: string;
}): RentalSettlement {
  const received = cents(input.depositIn);
  const refunded = cents(input.depositOut);
  const unpaidRental = cents(input.grandTotal) - cents(input.paidRental);
  const remaining = unpaidRental > 0n ? unpaidRental : 0n;
  const depositAvailable = received - refunded > 0n ? received - refunded : 0n;
  const refundDue = depositAvailable > remaining ? depositAvailable - remaining : 0n;
  const amountDue = remaining > depositAvailable ? remaining - depositAvailable : 0n;
  return {
    depositReceived: money(received),
    refundAmount: money(input.completed ? refundDue : 0n),
    amountStillDue: money(input.completed ? amountDue : remaining),
    settlementStatus: !input.completed
      ? 'PENDING'
      : refundDue > 0n
        ? 'REFUND_DUE'
        : amountDue > 0n
          ? 'AMOUNT_DUE'
          : 'BALANCED',
  };
}
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';
import { RentalInvariantError } from './rental-errors';
