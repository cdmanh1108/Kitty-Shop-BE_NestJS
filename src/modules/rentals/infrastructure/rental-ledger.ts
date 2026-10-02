import { Prisma } from '@prisma/client';

export function rentalLedger(
  payments: ReadonlyArray<{ amount: { toString(): string }; direction: string; purpose: string }>,
) {
  let paidRental = new Prisma.Decimal(0);
  let depositIn = new Prisma.Decimal(0);
  let depositOut = new Prisma.Decimal(0);
  for (const payment of payments) {
    const amount = new Prisma.Decimal(payment.amount.toString());
    if (payment.purpose === 'DEPOSIT' || payment.purpose === 'DEPOSIT_REFUND') {
      if (payment.direction === 'IN') depositIn = depositIn.plus(amount);
      else depositOut = depositOut.plus(amount);
    } else
      paidRental = payment.direction === 'IN' ? paidRental.plus(amount) : paidRental.minus(amount);
  }
  return {
    paidRental,
    depositIn,
    depositOut,
    depositHeld: Prisma.Decimal.max(0, depositIn.minus(depositOut)),
  };
}
