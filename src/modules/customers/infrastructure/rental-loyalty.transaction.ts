import type { Prisma } from '@prisma/client';
import type { CustomerLoyaltyOwner } from '../domain/customer-loyalty';

/** Customer-owned loyalty read used while settling a Rental order. */
export function countQualifiedRentalLoyaltyEntries(
  tx: Prisma.TransactionClient,
  input: { shopId: string; owner: CustomerLoyaltyOwner },
): Promise<number> {
  return tx.customerLoyaltyEntry.count({
    where: {
      shopId: input.shopId,
      entryType: 'QUALIFIED',
      ownerType: input.owner.type,
      ...(input.owner.type === 'WEB_ACCOUNT'
        ? { webAccountId: input.owner.webAccountId }
        : { customerId: input.owner.customerId }),
    },
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
    owner: CustomerLoyaltyOwner;
    createdAt: Date;
  },
): Promise<{ rewardId: string | null }> {
  const webAccountId = input.owner.type === 'WEB_ACCOUNT' ? input.owner.webAccountId : null;
  const entry = await tx.customerLoyaltyEntry.create({
    data: {
      shopId: input.shopId,
      customerId: input.customerId,
      orderId: input.orderId,
      entryType: 'QUALIFIED',
      ownerType: input.owner.type,
      webAccountId,
      rewardValue: input.rewardValue,
      createdAt: input.createdAt,
    },
    select: { id: true },
  });
  if (input.rewardValue <= 0) return { rewardId: null };

  const reward = await tx.customerLoyaltyReward.create({
    data: {
      shopId: input.shopId,
      customerId: input.customerId,
      ownerType: input.owner.type,
      webAccountId,
      earnedEntryId: entry.id,
      earnedOrderId: input.orderId,
      rewardValue: input.rewardValue,
      status: 'AVAILABLE',
      createdAt: input.createdAt,
    },
    select: { id: true },
  });
  return { rewardId: reward.id };
}
