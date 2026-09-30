import type { Prisma } from '@prisma/client';

/**
 * Serializes writes that share a Rental Order invariant. Callers must acquire
 * this lock before reading protected state and keep all reads and writes on
 * the same transaction client until commit. The lock order is shopId, orderId.
 */
export async function lockRentalOrder(
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
