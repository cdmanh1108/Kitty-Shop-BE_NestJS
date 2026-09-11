import { TRANSACTION_STATUS } from '@modules/finance/domain/payment-status';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { Prisma } from '@prisma/client';
import { calculateOrderPaymentState } from '@modules/finance/domain/payment-state';

/**
 * Recompute derived payment/deposit state from immutable-ish order totals and
 * non-voided payment transactions. Keep this helper inside the DB adapter
 * layer so every mutation that changes money can reuse the same semantics.
 */
export async function recomputeOrderPaymentState(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.rentalOrder.findUniqueOrThrow({ where: { id: orderId } });
  const transactions = await tx.paymentTransaction.findMany({
    where: { orderId, status: TRANSACTION_STATUS.COMPLETED, voidedAt: null },
    select: { amount: true, direction: true, purpose: true },
  });

  const state = calculateOrderPaymentState({
    grandTotal: decimalToNumber(order.grandTotal),
    depositRequired: decimalToNumber(order.depositRequired),
    transactions: transactions.map((transaction) => ({
      amount: decimalToNumber(transaction.amount),
      direction: transaction.direction,
      purpose: transaction.purpose,
    })),
  });

  await tx.rentalOrder.update({
    where: { id: orderId },
    data: state,
  });
}
