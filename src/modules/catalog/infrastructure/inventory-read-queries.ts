import { paginateMeta } from '@common/types/pagination';
import { activeOccupyingAllocationWhere } from '@database/prisma/inventory-availability';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogInventoryRepository } from '../domain/catalog-inventory.repository';

export async function inventorySummary(
  prisma: PrismaService,
  shopId: string,
): ReturnType<CatalogInventoryRepository['inventorySummary']> {
  const where = { shopId, archivedAt: null };
  const conditionsQuery = prisma.inventoryItem.groupBy({
    by: ['currentStatus'],
    orderBy: { currentStatus: 'asc' },
    where,
    _count: { _all: true },
  });
  const [conditions, occupied] = await prisma.$transaction([
    conditionsQuery,
    prisma.inventoryItem.count({
      where: {
        ...where,
        allocations: { some: { ...activeOccupyingAllocationWhere(), shopId } },
      },
    }),
  ]);
  const count = (status: string) =>
    conditions.find((c) => c.currentStatus === status)?._count._all ?? 0;
  return {
    total: conditions.reduce((sum, c) => sum + c._count._all, 0),
    available: count('AVAILABLE'),
    occupied,
    needsAttention: count('CLEANING') + count('REPAIRING') + count('DAMAGED') + count('LOST'),
  };
}

export async function inventoryHistory(
  prisma: PrismaService,
  input: Parameters<CatalogInventoryRepository['inventoryHistory']>[0],
): ReturnType<CatalogInventoryRepository['inventoryHistory']> {
  const where = {
    shopId: input.shopId,
    ...(input.inventoryItemId ? { inventoryItemId: input.inventoryItemId } : {}),
    inventoryItem: {
      shopId: input.shopId,
      ...(input.productId ? { variant: { productId: input.productId } } : {}),
    },
  };
  const limit = Math.min(100, Math.max(1, input.limit));
  const [items, total] = await prisma.$transaction([
    prisma.inventoryStatusHistory.findMany({
      where,
      select: {
        id: true,
        inventoryItemId: true,
        fromStatus: true,
        toStatus: true,
        reason: true,
        changedAt: true,
        inventoryItem: {
          select: { sku: true, variant: { select: { product: { select: { name: true } } } } },
        },
      },
      orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * limit,
      take: limit,
    }),
    prisma.inventoryStatusHistory.count({ where }),
  ]);
  return {
    items: items.map(({ inventoryItem, ...history }) => ({
      ...history,
      sku: inventoryItem.sku,
      productName: inventoryItem.variant.product.name,
    })),
    meta: paginateMeta(input.page, limit, total),
  };
}
