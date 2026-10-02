import { activeOccupyingAllocationWhere } from './catalog-rental-allocation.query';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import type { AddInventoryData } from '../domain/catalog-inventory.inputs';
import { CATALOG_ERROR_CODE, CatalogInvariantError } from '../domain/catalog-errors';
import type { CatalogInventoryRepository } from '../domain/catalog-inventory.repository';
import { validateInventoryStatusTransition } from '../domain/inventory-status.policy';
import { ALLOCATION_STATUS } from '@modules/rentals/public/rental-status';

export async function addInventoryItem(
  prisma: PrismaService,
  shopId: string,
  input: AddInventoryData,
): ReturnType<CatalogInventoryRepository['addInventoryItem']> {
  const variant = await prisma.productVariant.findFirst({
    where: { id: input.variantId, shopId },
    include: { product: true },
  });
  if (!variant) return null;
  if (variant.archivedAt) {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.PRODUCT_VARIANT_ARCHIVED,
      'Không thể tạo món đồ tồn kho cho biến thể đã lưu trữ.',
    );
  }

  if (input.locationId) {
    const location = await prisma.shopLocation.count({
      where: { id: input.locationId, shopId, isActive: true },
    });
    if (!location) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.INVENTORY_LOCATION_INVALID,
        'Vị trí kho không thuộc cửa hàng này hoặc đã ngưng hoạt động',
      );
    }
  }

  let sku = input.sku?.trim();
  if (!sku) {
    const count = await prisma.inventoryItem.count({
      where: { variantId: input.variantId },
    });
    sku = `${variant.variantCode}-${String(count + 1).padStart(3, '0')}`;
  }

  const existingSku = await prisma.inventoryItem.findFirst({
    where: { shopId, sku },
  });
  if (existingSku) {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.INVENTORY_SKU_ALREADY_EXISTS,
      `Mã SKU "${sku}" đã tồn tại trong kho của cửa hàng.`,
    );
  }

  if (input.barcode) {
    const existingBarcode = await prisma.inventoryItem.findFirst({
      where: { shopId, barcode: input.barcode },
    });
    if (existingBarcode) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.INVENTORY_BARCODE_ALREADY_EXISTS,
        `Mã vạch "${input.barcode}" đã tồn tại trong kho.`,
      );
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
        reason: 'Khởi tạo món đồ mới trong kho',
      },
    });

    return item;
  });
}

export async function updateInventoryStatus(
  prisma: PrismaService,
  input: Parameters<CatalogInventoryRepository['updateInventoryStatus']>[0],
): ReturnType<CatalogInventoryRepository['updateInventoryStatus']> {
  return serializableTransaction(prisma, async (tx) => {
    const existing = await tx.inventoryItem.findFirst({
      where: { id: input.id, shopId: input.shopId, archivedAt: null },
    });
    if (!existing) return null;

    if (input.expectedFromStatus && existing.currentStatus !== input.expectedFromStatus) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.INVENTORY_STATUS_MISMATCH,
        `Trạng thái món đồ đã thay đổi (thực tế: ${existing.currentStatus}, kỳ vọng: ${input.expectedFromStatus}). Vui lòng tải lại trang.`,
      );
    }

    const activeAllocation = await tx.rentalItemAllocation.findFirst({
      where: {
        inventoryItemId: input.id,
        ...activeOccupyingAllocationWhere(),
      },
      orderBy: { status: 'asc' }, // ACTIVE takes precedence over future reservations.
    });

    validateInventoryStatusTransition(existing.currentStatus, input.status, {
      hasActiveAllocation: !!activeAllocation,
      hasActiveRental: activeAllocation?.status === ALLOCATION_STATUS.ACTIVE,
      reason: input.reason,
    });

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
  return serializableTransaction(prisma, async (tx) => {
    const existing = await tx.inventoryItem.findFirst({
      where: { id, shopId, archivedAt: null },
    });
    if (!existing) return false;

    const activeAllocation = await tx.rentalItemAllocation.findFirst({
      where: {
        shopId,
        inventoryItemId: id,
        ...activeOccupyingAllocationWhere(),
      },
    });
    if (activeAllocation) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.INVENTORY_ACTIVE_ALLOCATION,
        'Không thể ngừng sử dụng món đồ đang có lịch đặt hoặc đang được thuê.',
      );
    }

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

    return true;
  });
}
