import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { Prisma } from '@prisma/client';
import { calculateOrderPaymentState } from '../domain/payment-state';

/** Recompute Finance payment/deposit projections within the caller's transaction. */
export async function recomputeOrderPaymentState(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.rentalOrder.findUniqueOrThrow({
    where: { id: orderId },
    include: { confirmation: true },
  });
  const transactions = await tx.paymentTransaction.findMany({
    where: { orderId, status: 'COMPLETED', voidedAt: null },
    select: { amount: true, direction: true, purpose: true },
  });

  const state = calculateOrderPaymentState({
    grandTotal: decimalToNumber(order.grandTotal),
    depositRequired: order.confirmation
      ? Number(order.confirmation.collateralAmount ?? 0)
      : decimalToNumber(order.depositRequired),
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
