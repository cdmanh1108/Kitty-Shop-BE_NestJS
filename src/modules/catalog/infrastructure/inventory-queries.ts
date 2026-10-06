import { activeOccupyingAllocationWhere } from './catalog-rental-allocation.query';
import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogInventoryRepository } from '../domain/catalog-inventory.repository';
import { getAllowedOperationalTransitions } from '../domain/inventory-status.policy';
import { ALLOCATION_STATUS } from '@modules/rentals/public/rental-status';
import { readProductKind } from './product-kind.mapper';
import type {
  InventoryOccupancyStatus,
  InventoryCurrentRentalSummary,
  InventoryPageItem,
  InventoryDetails,
} from '../domain/catalog.models';

function deriveOccupancy(
  allocation?: {
    id: string;
    status: string;
    reservedFrom: Date;
    reservedUntil: Date;
    order?: { id: string; orderNumber: string; status: string } | null;
  } | null,
): {
  occupancyStatus: InventoryOccupancyStatus;
  currentRental: null | InventoryCurrentRentalSummary;
  hasActiveAllocation: boolean;
  hasActiveRental: boolean;
} {
  if (allocation) {
    const isRented = allocation.status === ALLOCATION_STATUS.ACTIVE;
    return {
      occupancyStatus: isRented ? 'RENTED' : 'RESERVED',
      currentRental: allocation.order
        ? {
            orderId: allocation.order.id,
            orderNumber: allocation.order.orderNumber,
            status: allocation.order.status,
            reservedFrom: allocation.reservedFrom,
            reservedUntil: allocation.reservedUntil,
          }
        : null,
      hasActiveAllocation: true,
      hasActiveRental: isRented,
    };
  }

  return {
    occupancyStatus: 'FREE',
    currentRental: null,
    hasActiveAllocation: false,
    hasActiveRental: false,
  };
}

export async function listInventory(
  prisma: PrismaService,
  input: Parameters<CatalogInventoryRepository['listInventory']>[0],
) {
  // Catalog's occupancy projection intentionally joins Rental allocations and a
  // small order summary so the admin inventory list remains one read model.
  const where = {
    shopId: input.shopId,
    archivedAt: null,
    ...(input.status ? { currentStatus: input.status } : {}),
    ...(input.variantId ? { variantId: input.variantId } : {}),
    variant: {
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.categoryId ? { product: { categoryId: input.categoryId } } : {}),
    },
    ...(input.search
      ? {
          OR: [
            { sku: { contains: input.search, mode: 'insensitive' as const } },
            { barcode: { contains: input.search, mode: 'insensitive' as const } },
            {
              variant: {
                product: { code: { contains: input.search, mode: 'insensitive' as const } },
              },
            },
            { variant: { variantCode: { contains: input.search, mode: 'insensitive' as const } } },
            {
              variant: {
                product: { name: { contains: input.search, mode: 'insensitive' as const } },
              },
            },
          ],
        }
      : {}),
  };

  const [rawItems, total] = await prisma.$transaction([
    prisma.inventoryItem.findMany({
      where,
      select: {
        id: true,
        variantId: true,
        sku: true,
        currentStatus: true,
        condition: true,
        updatedAt: true,
        variant: {
          select: {
            id: true,
            variantCode: true,
            sizeId: true,
            colorId: true,
            product: { select: { id: true, code: true, name: true, categoryId: true, kind: true } },
            size: { select: { id: true, code: true, name: true, sortOrder: true, isActive: true } },
            color: { select: { id: true, code: true, name: true, hexColor: true, isActive: true } },
          },
        },
        allocations: {
          where: activeOccupyingAllocationWhere(),
          select: {
            id: true,
            status: true,
            reservedFrom: true,
            reservedUntil: true,
            order: { select: { id: true, orderNumber: true, status: true } },
          },
          orderBy: [{ status: 'asc' }, { reservedFrom: 'asc' }],
          take: 1,
        },
      },
      orderBy: { sku: 'asc' },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  const items: InventoryPageItem[] = rawItems.map((item) => {
    const alloc = item.allocations[0] || null;
    const { occupancyStatus, currentRental, hasActiveAllocation, hasActiveRental } =
      deriveOccupancy(alloc);
    const allowedManualTransitions = getAllowedOperationalTransitions(item.currentStatus, {
      hasActiveAllocation,
      hasActiveRental,
    });

    const { allocations: _allocations, ...rest } = item;
    void _allocations;
    return {
      ...rest,
      variant: {
        ...rest.variant,
        product: { ...rest.variant.product, kind: readProductKind(rest.variant.product.kind) },
      },
      occupancyStatus,
      allowedManualTransitions,
      currentRental,
    };
  });

  return { items, meta: paginateMeta(input.page, input.limit, total) };
}

export async function findInventoryItem(
  prisma: PrismaService,
  shopId: string,
  id: string,
): Promise<InventoryDetails> {
  // This Catalog-owned detail projection includes Rental allocations and their
  // order/customer summary; it does not mutate Rental-owned tables.
  const item = await prisma.inventoryItem.findFirst({
    where: { id, shopId, archivedAt: null },
    include: {
      location: true,
      variant: {
        include: {
          product: true,
          size: true,
          color: true,
          rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
        },
      },
      statusHistory: { orderBy: { changedAt: 'desc' }, take: 100 },
      allocations: {
        where: activeOccupyingAllocationWhere(),
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              customer: { select: { fullName: true, phone: true } },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { reservedFrom: 'asc' }],
        take: 20,
      },
    },
  });

  if (!item) return null;

  const firstAlloc = item.allocations[0] || null;
  const { occupancyStatus, currentRental, hasActiveAllocation, hasActiveRental } =
    deriveOccupancy(firstAlloc);
  const allowedManualTransitions = getAllowedOperationalTransitions(item.currentStatus, {
    hasActiveAllocation,
    hasActiveRental,
  });

  return {
    ...item,
    variant: {
      ...item.variant,
      product: { ...item.variant.product, kind: readProductKind(item.variant.product.kind) },
    },
    occupancyStatus,
    allowedManualTransitions,
    currentRental,
  };
}

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
