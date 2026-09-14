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

export async function recordRentalReceipt(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    shopId: string;
    customerId: string;
    actorMemberId: string;
    key: string;
    purpose: string;
    direction: 'IN' | 'OUT';
    amount: Prisma.Decimal;
    paidAt: Date;
    paymentMethod: string;
    note?: string;
    source?: 'ADMIN_MANUAL' | 'INTERNAL_TRANSFER';
  },
) {
  if (!input.amount.greaterThan(0)) return;
  await tx.paymentTransaction.create({
    data: {
      shopId: input.shopId,
      orderId: input.orderId,
      customerId: input.customerId,
      transactionNumber: input.key,
      receiptKey: input.key,
      source: input.source ?? 'ADMIN_MANUAL',
      purpose: input.purpose,
      direction: input.direction,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      paidAt: input.paidAt,
      createdBy: input.actorMemberId,
      note: input.note,
    },
  });
}
