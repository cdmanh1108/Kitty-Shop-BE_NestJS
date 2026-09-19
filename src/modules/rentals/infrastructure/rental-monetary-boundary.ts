import type { Prisma } from '@prisma/client';

/**
 * Serializes monetary mutations for one tenant-scoped rental order. Acquire
 * this row lock before every protected read, then keep all validation and
 * writes on the same transaction client until commit. C05/C06 must use this
 * exact lock order: shopId, then orderId.
 */
export async function lockRentalMonetaryOrder(
  tx: Prisma.TransactionClient,
  input: { shopId: string; orderId: string },
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM rental_orders
    WHERE shop_id = ${input.shopId}::uuid
      AND id = ${input.orderId}::uuid
    FOR UPDATE
  `;
  return rows.length === 1;
}
