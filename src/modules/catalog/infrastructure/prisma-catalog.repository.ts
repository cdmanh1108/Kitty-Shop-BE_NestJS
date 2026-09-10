import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import { paginateMeta } from '@common/dto/pagination.query.dto';
import { CatalogInvariantError } from '../domain/catalog.repository';
import type {
  AddInventoryData,
  CatalogRepository,
  CreateProductData,
  ProductMediaData,
  UpdateProductData,
} from '../domain/catalog.repository';

@Injectable()
export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listLookups(shopId: string) {
    const [categories, sizes, colors, locations] = await this.prisma.$transaction([
      this.prisma.category.findMany({ where: { shopId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.size.findMany({ where: { shopId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.color.findMany({ where: { shopId }, orderBy: { name: 'asc' } }),
      this.prisma.shopLocation.findMany({ where: { shopId, isActive: true }, orderBy: { isPrimary: 'desc' } }),
    ]);
    return { categories, sizes, colors, locations };
  }

  async createCategory(shopId: string, input: { code: string; name: string; parentId?: string }) {
    if (input.parentId) {
      const parent = await this.prisma.category.count({ where: { id: input.parentId, shopId, isActive: true } });
      if (!parent) throw new CatalogInvariantError('Parent category does not belong to this shop or is inactive');
    }
    return this.prisma.category.create({ data: { shopId, ...input } });
  }

  createSize(shopId: string, input: { code: string; name: string; sortOrder: number }) {
    return this.prisma.size.create({ data: { shopId, ...input } });
  }

  createColor(shopId: string, input: { code: string; name: string; hexColor?: string }) {
    return this.prisma.color.create({ data: { shopId, ...input } });
  }

  async listProducts(input: { shopId: string; search?: string; categoryId?: string; status?: string; page: number; limit: number }) {
    const where = {
      shopId: input.shopId,
      archivedAt: null,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' as const } },
              { code: { contains: input.search, mode: 'insensitive' as const } },
              { variants: { some: { inventoryItems: { some: { sku: { contains: input.search, mode: 'insensitive' as const } } } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          media: { where: { isPrimary: true }, take: 1 },
          variants: { include: { _count: { select: { inventoryItems: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, meta: paginateMeta(input.page, input.limit, total) };
  }

  findProduct(shopId: string, id: string) {
    return this.prisma.product.findFirst({
      where: { id, shopId, archivedAt: null },
      include: {
        category: true,
        media: { orderBy: { sortOrder: 'asc' } },
        rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
        variants: {
          include: {
            size: true,
            color: true,
            rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
            inventoryItems: { where: { isActive: true }, orderBy: { sku: 'asc' } },
          },
        },
      },
    });
  }

  createProduct(shopId: string, input: CreateProductData) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCatalogReferences(tx, shopId, input.categoryId, input.variants);
      const product = await tx.product.create({
        data: {
          shopId,
          categoryId: input.categoryId,
          code: input.code,
          name: input.name,
          description: input.description,
          defaultDepositAmount: input.defaultDepositAmount,
          isPublic: input.isPublic,
        },
      });

      for (const variantInput of input.variants) {
        const variant = await tx.productVariant.create({
          data: {
            shopId,
            productId: product.id,
            variantCode: variantInput.variantCode,
            sizeId: variantInput.sizeId,
            colorId: variantInput.colorId,
            depositAmountOverride: variantInput.depositAmountOverride,
          },
        });
        await tx.rentalRate.createMany({
          data: variantInput.rentalRates.map((rate) => ({
            shopId,
            productId: product.id,
            variantId: variant.id,
            durationDays: rate.durationDays,
            price: rate.price,
          })),
        });
        const prefix = variantInput.skuPrefix ?? variantInput.variantCode;
        for (let index = 1; index <= variantInput.inventoryCount; index += 1) {
          await tx.inventoryItem.create({
            data: {
              shopId,
              variantId: variant.id,
              sku: `${prefix}-${String(index).padStart(3, '0')}`,
            },
          });
        }
      }

      if (input.media.length > 0) {
        await tx.productMedia.createMany({
          data: input.media.map((media) => ({ ...media, shopId, productId: product.id })),
        });
      }

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: { variants: { include: { inventoryItems: true, rentalRates: true } }, media: true },
      });
    });
  }

  async addVariant(shopId: string, productId: string, input: CreateProductData['variants'][number]) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId, archivedAt: null } });
    if (!product) return null;
    return this.prisma.$transaction(async (tx) => {
      await this.assertVariantReferences(tx, shopId, input);
      const variant = await tx.productVariant.create({
        data: {
          shopId,
          productId,
          variantCode: input.variantCode,
          sizeId: input.sizeId,
          colorId: input.colorId,
          depositAmountOverride: input.depositAmountOverride,
        },
      });
      await tx.rentalRate.createMany({
        data: input.rentalRates.map((rate) => ({ shopId, productId, variantId: variant.id, durationDays: rate.durationDays, price: rate.price })),
      });
      const prefix = input.skuPrefix ?? input.variantCode;
      for (let index = 1; index <= input.inventoryCount; index += 1) {
        await tx.inventoryItem.create({ data: { shopId, variantId: variant.id, sku: `${prefix}-${String(index).padStart(3, '0')}` } });
      }
      return tx.productVariant.findUnique({ where: { id: variant.id }, include: { rentalRates: true, inventoryItems: true, size: true, color: true } });
    });
  }

  async upsertRentalRate(shopId: string, variantId: string, input: { durationDays: number; price: number }) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, shopId, archivedAt: null } });
    if (!variant) return null;
    const existing = await this.prisma.rentalRate.findFirst({ where: { shopId, variantId, durationDays: input.durationDays, isActive: true } });
    if (existing) {
      return this.prisma.rentalRate.update({ where: { id: existing.id }, data: { price: input.price } });
    }
    return this.prisma.rentalRate.create({ data: { shopId, productId: variant.productId, variantId, durationDays: input.durationDays, price: input.price } });
  }

  async updateProduct(shopId: string, id: string, input: UpdateProductData) {
    const existing = await this.prisma.product.findFirst({ where: { id, shopId, archivedAt: null } });
    if (!existing) return null;
    if (input.categoryId) {
      const category = await this.prisma.category.count({ where: { id: input.categoryId, shopId, isActive: true } });
      if (!category) throw new CatalogInvariantError('Category does not belong to this shop or is inactive');
    }
    return this.prisma.product.update({ where: { id }, data: input });
  }


  async addProductMedia(shopId: string, productId: string, input: ProductMediaData) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId, archivedAt: null } });
    if (!product) return null;
    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.productMedia.updateMany({ where: { shopId, productId, isPrimary: true }, data: { isPrimary: false } });
      }
      return tx.productMedia.create({ data: { shopId, productId, ...input } });
    });
  }

  async removeProductMedia(shopId: string, productId: string, mediaId: string): Promise<boolean> {
    const deleted = await this.prisma.productMedia.deleteMany({ where: { id: mediaId, shopId, productId } });
    return deleted.count === 1;
  }

  async addInventoryItem(shopId: string, input: AddInventoryData) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: input.variantId, shopId, archivedAt: null } });
    if (!variant) return null;
    if (input.locationId) {
      const location = await this.prisma.shopLocation.count({ where: { id: input.locationId, shopId, isActive: true } });
      if (!location) throw new CatalogInvariantError('Inventory location does not belong to this shop or is inactive');
    }
    return this.prisma.inventoryItem.create({ data: { shopId, ...input } });
  }

  async updateInventoryStatus(input: { shopId: string; id: string; status: string; condition?: string; reason?: string; notes?: string; changedBy: string }) {
    const existing = await this.prisma.inventoryItem.findFirst({ where: { id: input.id, shopId: input.shopId, archivedAt: null } });
    if (!existing) return null;
    return this.prisma.$transaction(async (tx) => {
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

  async listInventory(input: { shopId: string; variantId?: string; status?: string; search?: string; page: number; limit: number }) {
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
              { variant: { product: { name: { contains: input.search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        include: { variant: { include: { product: true, size: true, color: true } }, location: true },
        orderBy: { sku: 'asc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return { items, meta: paginateMeta(input.page, input.limit, total) };
  }

  findInventoryItem(shopId: string, id: string) {
    return this.prisma.inventoryItem.findFirst({
      where: { id, shopId, archivedAt: null },
      include: {
        location: true,
        variant: { include: { product: true, size: true, color: true, rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } } } },
        statusHistory: { orderBy: { changedAt: 'desc' }, take: 100 },
        serviceRecords: { orderBy: { createdAt: 'desc' }, take: 50 },
        allocations: {
          where: { status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] }, reservedUntil: { gt: new Date() } },
          include: { order: { select: { id: true, orderNumber: true, status: true, customer: { select: { fullName: true, phone: true } } } } },
          orderBy: { reservedFrom: 'asc' },
          take: 20,
        },
      },
    });
  }

  findAvailableInventory(input: { shopId: string; variantId: string; from: Date; until: Date }) {
    return this.prisma.inventoryItem.findMany({
      where: {
        shopId: input.shopId,
        variantId: input.variantId,
        isActive: true,
        archivedAt: null,
        currentStatus: { notIn: ['CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED'] },
        allocations: {
          none: {
            status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] },
            reservedFrom: { lt: input.until },
            reservedUntil: { gt: input.from },
          },
        },
      },
      orderBy: [{ totalRentalCount: 'asc' }, { sku: 'asc' }],
    });
  }
  private async assertCatalogReferences(
    tx: Prisma.TransactionClient,
    shopId: string,
    categoryId: string,
    variants: CreateProductData['variants'],
  ): Promise<void> {
    const category = await tx.category.count({ where: { id: categoryId, shopId, isActive: true } });
    if (!category) throw new CatalogInvariantError('Category does not belong to this shop or is inactive');
    for (const variant of variants) await this.assertVariantReferences(tx, shopId, variant);
  }

  private async assertVariantReferences(
    tx: Prisma.TransactionClient,
    shopId: string,
    variant: CreateProductData['variants'][number],
  ): Promise<void> {
    if (variant.sizeId) {
      const size = await tx.size.count({ where: { id: variant.sizeId, shopId } });
      if (!size) throw new CatalogInvariantError('Size does not belong to this shop');
    }
    if (variant.colorId) {
      const color = await tx.color.count({ where: { id: variant.colorId, shopId } });
      if (!color) throw new CatalogInvariantError('Color does not belong to this shop');
    }
  }

}
