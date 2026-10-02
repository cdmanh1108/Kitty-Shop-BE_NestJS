import type { Prisma } from '@prisma/client';

/** Customer-owned loyalty read used while settling a Rental order. */
export function countQualifiedRentalLoyaltyEntries(
  tx: Prisma.TransactionClient,
  input: { shopId: string; customerId: string },
): Promise<number> {
  return tx.customerLoyaltyEntry.count({
    where: { shopId: input.shopId, customerId: input.customerId, entryType: 'QUALIFIED' },
  });
}

/** Customer-owned loyalty persistence within the caller's Rental transaction. */
export async function createRentalLoyaltyEntry(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    customerId: string;
    orderId: string;
    rewardValue: number;
  },
): Promise<void> {
  await tx.customerLoyaltyEntry.create({
    data: {
      shopId: input.shopId,
      customerId: input.customerId,
      orderId: input.orderId,
      entryType: 'QUALIFIED',
      rewardValue: input.rewardValue,
    },
  });
}
