import type { Prisma } from '@prisma/client';
import type { InventoryStatus } from '../domain/catalog-status';

/** Catalog-owned inventory mutations within an existing Rental transaction. */
export async function markInventoryRented(
  tx: Prisma.TransactionClient,
  input: { inventoryItemIds: readonly string[]; rentedAt: Date },
): Promise<void> {
  for (const inventoryItemId of input.inventoryItemIds) {
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { lastRentedAt: input.rentedAt },
    });
  }
}

/** Apply the Rental inspection result while Catalog owns status history persistence. */
export async function recordRentalReturnInspection(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    orderId: string;
    inventoryItemId: string;
    status: InventoryStatus;
    returnedAt: Date;
    changedBy?: string;
    reason: string;
    notes: string | null;
  },
): Promise<void> {
  const inventory = await tx.inventoryItem.findUniqueOrThrow({
    where: { id: input.inventoryItemId },
  });
  await tx.inventoryItem.update({
    where: { id: inventory.id },
    data: {
      currentStatus: input.status,
      totalRentalCount: { increment: 1 },
      lastRentedAt: input.returnedAt,
    },
  });
  await tx.inventoryStatusHistory.create({
    data: {
      shopId: input.shopId,
      inventoryItemId: inventory.id,
      fromStatus: inventory.currentStatus,
      toStatus: input.status,
      orderId: input.orderId,
      changedBy: input.changedBy,
      reason: input.reason,
      notes: input.notes,
    },
  });
}
