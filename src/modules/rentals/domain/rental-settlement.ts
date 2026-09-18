export interface RentalSettlement {
  depositReceived: string;
  depositAvailable: string;
  refundAmount: string;
  amountStillDue: string;
  settlementStatus: 'PENDING' | 'REFUND_DUE' | 'AMOUNT_DUE' | 'BALANCED' | 'SETTLED';
}

export interface RentalPaymentTotals {
  paidAmount: string;
  remainingAmount: string;
  depositIn: string;
  depositOut: string;
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

function decimal(value: bigint): string {
  const formatted = money(value);
  if (formatted.endsWith('.00')) return formatted.slice(0, -3);
  return formatted.endsWith('0') ? formatted.slice(0, -1) : formatted;
}

/**
 * Derives payment balances from completed payment records. This is domain
 * financial truth; callers should pass the resulting primitives to their
 * presentation layer rather than recalculating from persistence decimals.
 */
export function calculateRentalPaymentTotals(input: {
  grandTotal: string;
  payments: ReadonlyArray<{ amount: string; direction: string; purpose: string }>;
}): RentalPaymentTotals {
  let paidAmount = 0n;
  let depositIn = 0n;
  let depositOut = 0n;
  for (const payment of input.payments) {
    const amount = cents(payment.amount);
    if (payment.purpose === 'DEPOSIT' || payment.purpose === 'DEPOSIT_REFUND') {
      if (payment.direction === 'IN') depositIn += amount;
      else depositOut += amount;
    } else {
      paidAmount = payment.direction === 'IN' ? paidAmount + amount : paidAmount - amount;
    }
  }
  const grandTotal = cents(input.grandTotal);
  return {
    paidAmount: decimal(paidAmount),
    remainingAmount: decimal(grandTotal > paidAmount ? grandTotal - paidAmount : 0n),
    depositIn: decimal(depositIn),
    depositOut: decimal(depositOut),
  };
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
  status: string;
  hasSettlement?: boolean;
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
  const isPostReturn = input.status === 'RETURNED' || input.status === 'COMPLETED';

  let settlementStatus: RentalSettlement['settlementStatus'];
  if (input.hasSettlement || input.status === 'COMPLETED') {
    settlementStatus = 'SETTLED';
  } else if (!isPostReturn) {
    settlementStatus = 'PENDING';
  } else if (refundDue > 0n) {
    settlementStatus = 'REFUND_DUE';
  } else if (amountDue > 0n) {
    settlementStatus = 'AMOUNT_DUE';
  } else {
    settlementStatus = 'BALANCED';
  }

  return {
    depositReceived: money(received),
    depositAvailable: money(depositAvailable),
    refundAmount: money(
      isPostReturn && !input.hasSettlement && input.status !== 'COMPLETED' ? refundDue : 0n,
    ),
    amountStillDue: money(
      isPostReturn && !input.hasSettlement && input.status !== 'COMPLETED'
        ? amountDue
        : input.hasSettlement
          ? 0n
          : remaining,
    ),
    settlementStatus,
  };
}
import type { RentalPolicy } from '@modules/settings/domain/rental-policy';
import { RentalInvariantError } from './rental-errors';
