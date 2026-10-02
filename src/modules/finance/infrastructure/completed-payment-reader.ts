import type { Prisma } from '@prisma/client';
import { TRANSACTION_STATUS } from '../domain/payment-status';

/** Finance-owned payment read projection used by Rental cancellation checks. */
export function countCompletedPayments(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<number> {
  return tx.paymentTransaction.count({
    where: { orderId, status: TRANSACTION_STATUS.COMPLETED, voidedAt: null },
  });
}

export async function listCompletedPaymentLines(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<Array<{ amount: string; direction: string; purpose: string }>> {
  const rows = await tx.paymentTransaction.findMany({
    where: { orderId, status: TRANSACTION_STATUS.COMPLETED, voidedAt: null },
    select: { amount: true, direction: true, purpose: true },
  });
  return rows.map((row) => ({
    amount: row.amount.toString(),
    direction: row.direction,
    purpose: row.purpose,
  }));
}
