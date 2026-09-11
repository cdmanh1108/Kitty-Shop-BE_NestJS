import { availableInventoryWhere } from './inventory-availability';
import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { AddInventoryData, CatalogRepository } from '../domain/catalog.repository';
import { CatalogInvariantError } from '../domain/catalog.repository';

export async function addInventoryItem(
  prisma: PrismaService,
  shopId: string,
  input: AddInventoryData,
): ReturnType<CatalogRepository['addInventoryItem']> {
  const variant = await prisma.productVariant.findFirst({
    where: { id: input.variantId, shopId, archivedAt: null },
  });
  if (!variant) return null;
  if (input.locationId) {
    const location = await prisma.shopLocation.count({
      where: { id: input.locationId, shopId, isActive: true },
    });
    if (!location)
      throw new CatalogInvariantError(
        'Inventory location does not belong to this shop or is inactive',
      );
  }
  return prisma.inventoryItem.create({ data: { shopId, ...input } });
}
export async function updateInventoryStatus(
  prisma: PrismaService,
  input: {
    shopId: string;
    id: string;
    status: string;
    condition?: string;
    reason?: string;
    notes?: string;
    changedBy: string;
  },
): ReturnType<CatalogRepository['updateInventoryStatus']> {
  const existing = await prisma.inventoryItem.findFirst({
    where: { id: input.id, shopId: input.shopId, archivedAt: null },
  });
  if (!existing) return null;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryItem.update({
      where: { id: input.id },
      data: {
        currentStatus: input.status,
        ...(input.condition ? { condition: input.condition } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    await tx.inventoryStatusHistory.create({
      data: {
        shopId: input.shopId,
        inventoryItemId: input.id,
        fromStatus: existing.currentStatus,
        toStatus: input.status,
        reason: input.reason,
        notes: input.notes,
        changedBy: input.changedBy,
      },
    });
    return updated;
  });
}
export async function listInventory(
  prisma: PrismaService,
  input: {
    shopId: string;
    variantId?: string;
    status?: string;
    search?: string;
    page: number;
    limit: number;
  },
): ReturnType<CatalogRepository['listInventory']> {
  const where = {
    shopId: input.shopId,
    archivedAt: null,
    ...(input.variantId ? { variantId: input.variantId } : {}),
    ...(input.status ? { currentStatus: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { sku: { contains: input.search, mode: 'insensitive' as const } },
            { barcode: { contains: input.search, mode: 'insensitive' as const } },
            {
              variant: {
                product: { name: { contains: input.search, mode: 'insensitive' as const } },
              },
            },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.inventoryItem.findMany({
      where,
      include: {
        variant: { include: { product: true, size: true, color: true } },
        location: true,
      },
      orderBy: { sku: 'asc' },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.inventoryItem.count({ where }),
  ]);
  return { items, meta: paginateMeta(input.page, input.limit, total) };
}
export function findInventoryItem(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<CatalogRepository['findInventoryItem']> {
  return prisma.inventoryItem.findFirst({
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
      serviceRecords: { orderBy: { createdAt: 'desc' }, take: 50 },
      allocations: {
        where: {
          status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] },
          reservedUntil: { gt: new Date() },
        },
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
        orderBy: { reservedFrom: 'asc' },
        take: 20,
      },
    },
  });
}
export function findAvailableInventory(
  prisma: PrismaService,
  input: { shopId: string; variantId: string; from: Date; until: Date },
): ReturnType<CatalogRepository['findAvailableInventory']> {
  return prisma.inventoryItem.findMany({
    where: {
      shopId: input.shopId,
      variantId: input.variantId,
      ...availableInventoryWhere(input),
    },
    orderBy: [{ totalRentalCount: 'asc' }, { sku: 'asc' }],
  });
}
