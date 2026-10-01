import { Prisma } from '@prisma/client';

/** Lock the Rental Order row before reading or changing its protected state. */
export async function lockRentalOrder(
  tx: Prisma.TransactionClient,
  input: { shopId: string; orderId: string },
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id
    FROM rental_orders
    WHERE shop_id = ${input.shopId}::uuid
      AND id = ${input.orderId}::uuid
    FOR UPDATE
  `);
  return rows.length === 1;
}
