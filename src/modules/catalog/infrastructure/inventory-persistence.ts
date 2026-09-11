import { availableInventoryWhere } from './inventory-availability';
import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import {
  type AddInventoryData,
  type CatalogRepository,
  CatalogInvariantError,
} from '../domain/catalog.repository';
import {
  validateInventoryStatusTransition,
  getAllowedOperationalTransitions,
} from '../domain/inventory-status.policy';
import type { InventoryStatus } from '../domain/catalog-status';
import type {
  InventoryOccupancyStatus,
  InventoryCurrentRentalSummary,
  InventoryPageItem,
  InventoryDetails,
} from '../domain/catalog.models';

function deriveOccupancy(
  itemStatus: string,
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
  if (itemStatus === 'RENTED') {
    return {
      occupancyStatus: 'RENTED',
      currentRental:
        allocation && allocation.order
          ? {
              orderId: allocation.order.id,
              orderNumber: allocation.order.orderNumber,
              status: allocation.order.status,
              reservedFrom: allocation.reservedFrom,
              reservedUntil: allocation.reservedUntil,
            }
          : null,
      hasActiveAllocation: true,
      hasActiveRental: true,
    };
  }

  if (allocation) {
    const isRented = allocation.status === 'ACTIVE';
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

export async function addInventoryItem(
  prisma: PrismaService,
  shopId: string,
  input: AddInventoryData,
): ReturnType<CatalogRepository['addInventoryItem']> {
  const variant = await prisma.productVariant.findFirst({
    where: { id: input.variantId, shopId, archivedAt: null },
    include: { product: true },
  });
  if (!variant) return null;

  if (input.locationId) {
    const location = await prisma.shopLocation.count({
      where: { id: input.locationId, shopId, isActive: true },
    });
    if (!location) {
      throw new CatalogInvariantError(
        'Vị trí kho không thuộc cửa hàng này hoặc đã ngưng hoạt động',
      );
    }
  }

  let sku = input.sku?.trim();
  if (!sku) {
    const existingCount = await prisma.inventoryItem.count({
      where: { shopId, variantId: variant.id },
    });
    let seq = existingCount + 1;
    let candidate = `${variant.variantCode}-${String(seq).padStart(3, '0')}`;
    while ((await prisma.inventoryItem.count({ where: { shopId, sku: candidate } })) > 0) {
      seq++;
      candidate = `${variant.variantCode}-${String(seq).padStart(3, '0')}`;
    }
    sku = candidate;
  } else {
    const duplicate = await prisma.inventoryItem.findFirst({
      where: { shopId, sku },
    });
    if (duplicate) {
      throw new CatalogInvariantError(`Mã SKU "${sku}" đã tồn tại trong kho của cửa hàng.`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        shopId,
        variantId: input.variantId,
        locationId: input.locationId,
        sku,
        barcode: input.barcode,
        purchasePrice: input.purchasePrice,
        purchaseDate: input.purchaseDate,
        notes: input.notes,
        currentStatus: 'AVAILABLE',
        condition: 'GOOD',
      },
    });

    await tx.inventoryStatusHistory.create({
      data: {
        shopId,
        inventoryItemId: item.id,
        fromStatus: null,
        toStatus: 'AVAILABLE',
        reason: 'Tạo mới món đồ vật lý',
        notes: input.notes,
        changedBy: input.changedBy || 'SYSTEM',
      },
    });

    return item;
  });
}

export async function updateInventoryStatus(
  prisma: PrismaService,
  input: Parameters<CatalogRepository['updateInventoryStatus']>[0],
): ReturnType<CatalogRepository['updateInventoryStatus']> {
  const existing = await prisma.inventoryItem.findFirst({
    where: { id: input.id, shopId: input.shopId, archivedAt: null },
  });
  if (!existing) return null;

  if (input.expectedFromStatus && existing.currentStatus !== input.expectedFromStatus) {
    throw new CatalogInvariantError(
      `Trạng thái món đồ đã thay đổi (thực tế: ${existing.currentStatus}, kỳ vọng: ${input.expectedFromStatus}). Vui lòng tải lại trang.`,
    );
  }

  const activeAllocation = await prisma.rentalItemAllocation.findFirst({
    where: {
      inventoryItemId: input.id,
      status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] },
      releasedAt: null,
      reservedUntil: { gt: new Date() },
    },
  });

  validateInventoryStatusTransition(
    existing.currentStatus as InventoryStatus,
    input.status,
    {
      hasActiveAllocation: !!activeAllocation,
      hasActiveRental: existing.currentStatus === 'RENTED',
      reason: input.reason,
    },
  );

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

export async function archiveInventoryItem(
  prisma: PrismaService,
  shopId: string,
  id: string,
  reason?: string,
  changedBy?: string,
): Promise<boolean> {
  const existing = await prisma.inventoryItem.findFirst({
    where: { id, shopId, archivedAt: null },
  });
  if (!existing) return false;

  const activeAllocation = await prisma.rentalItemAllocation.findFirst({
    where: {
      inventoryItemId: id,
      status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] },
      releasedAt: null,
      reservedUntil: { gt: new Date() },
    },
  });
  if (activeAllocation) {
    throw new CatalogInvariantError(
      'Không thể ngừng sử dụng món đồ đang có lịch đặt hoặc đang được thuê.',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id },
      data: {
        isActive: false,
        currentStatus: 'RETIRED',
        archivedAt: new Date(),
      },
    });
    await tx.inventoryStatusHistory.create({
      data: {
        shopId,
        inventoryItemId: id,
        fromStatus: existing.currentStatus,
        toStatus: 'RETIRED',
        reason: reason || 'Ngừng sử dụng món đồ',
        changedBy: changedBy || 'ADMIN',
      },
    });
  });

  return true;
}

export async function listInventory(
  prisma: PrismaService,
  input: Parameters<CatalogRepository['listInventory']>[0],
): ReturnType<CatalogRepository['listInventory']> {
  const where = {
    shopId: input.shopId,
    archivedAt: null,
    ...(input.variantId ? { variantId: input.variantId } : {}),
    ...(input.productId ? { variant: { productId: input.productId } } : {}),
    ...(input.categoryId ? { variant: { product: { categoryId: input.categoryId } } } : {}),
    ...(input.status ? { currentStatus: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { sku: { contains: input.search, mode: 'insensitive' as const } },
            { barcode: { contains: input.search, mode: 'insensitive' as const } },
            { variant: { variantCode: { contains: input.search, mode: 'insensitive' as const } } },
            {
              variant: {
                product: { code: { contains: input.search, mode: 'insensitive' as const } },
              },
            },
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
      include: {
        variant: { include: { product: true, size: true, color: true } },
        location: true,
        allocations: {
          where: {
            status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] },
            releasedAt: null,
            reservedUntil: { gt: new Date() },
          },
          include: {
            order: {
              select: { id: true, orderNumber: true, status: true },
            },
          },
          orderBy: { reservedFrom: 'asc' },
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
      deriveOccupancy(item.currentStatus, alloc);
    const allowedManualTransitions = getAllowedOperationalTransitions(
      item.currentStatus as InventoryStatus,
      { hasActiveAllocation, hasActiveRental },
    );

    const { allocations: _allocations, ...rest } = item;
    void _allocations;
    return {
      ...rest,
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
      serviceRecords: { orderBy: { createdAt: 'desc' }, take: 50 },
      allocations: {
        where: {
          status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] },
          releasedAt: null,
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

  if (!item) return null;

  const firstAlloc = item.allocations[0] || null;
  const { occupancyStatus, currentRental, hasActiveAllocation, hasActiveRental } =
    deriveOccupancy(item.currentStatus, firstAlloc);
  const allowedManualTransitions = getAllowedOperationalTransitions(
    item.currentStatus as InventoryStatus,
    { hasActiveAllocation, hasActiveRental },
  );

  return {
    ...item,
    occupancyStatus,
    allowedManualTransitions,
    currentRental,
  };
}

export function findAvailableInventory(
  prisma: PrismaService,
  input: Parameters<CatalogRepository['findAvailableInventory']>[0],
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
