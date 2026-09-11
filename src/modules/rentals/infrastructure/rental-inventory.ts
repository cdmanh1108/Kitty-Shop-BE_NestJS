import type { Prisma } from '@prisma/client';
import {
  operationallyRentableInventoryWhere,
  unreleasedRentalWhere,
} from '@database/prisma/inventory-availability';
import { RentalInventoryUnavailableError } from '../domain/rental-errors';

/** Run in the owning Serializable transaction, never against the root client.
 * Overlaps remain enforced on allocation writes by rental_item_no_overlap.
 */
export async function assertInventoryRentable(
  tx: Prisma.TransactionClient,
  input: { shopId: string; inventoryIds: string[]; variantId?: string; excludeOrderId?: string },
): Promise<void> {
  if (input.inventoryIds.length === 0) return;
  const count = await tx.inventoryItem.count({
    where: {
      id: { in: input.inventoryIds },
      shopId: input.shopId,
      variantId: input.variantId,
      ...operationallyRentableInventoryWhere(),
      allocations: {
        none: {
          ...unreleasedRentalWhere(),
          ...(input.excludeOrderId ? { orderId: { not: input.excludeOrderId } } : {}),
        },
      },
    },
  });
  if (count !== input.inventoryIds.length) throw new RentalInventoryUnavailableError();
}
