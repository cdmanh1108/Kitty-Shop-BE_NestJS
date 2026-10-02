import type { Prisma } from '@prisma/client';

export interface RentalReceiptInput {
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
}

/** Finance-owned payment persistence for an existing Rental transaction. */
export async function recordRentalReceipt(
  tx: Prisma.TransactionClient,
  input: RentalReceiptInput,
): Promise<void> {
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
