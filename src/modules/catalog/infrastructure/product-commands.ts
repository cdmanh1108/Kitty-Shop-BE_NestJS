import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { serializableTransaction } from '@database/prisma/transaction';
import { activeOccupyingAllocationWhere } from '@database/prisma/inventory-availability';
import type {
  CatalogRepository,
  CreateProductData,
  ProductMediaData,
  UpdateProductData,
} from '../domain/catalog.repository';
import { CatalogCategoryError, CatalogInvariantError } from '../domain/catalog.repository';

export function createProduct(
  prisma: PrismaService,
  shopId: string,
  input: CreateProductData,
): ReturnType<CatalogRepository['createProduct']> {
  return prisma.$transaction(async (tx) => {
    const seenCombinations = new Set<string>();
    for (const variant of input.variants) {
      const key = `${variant.sizeId ?? 'null'}::${variant.colorId ?? 'null'}`;
      if (seenCombinations.has(key)) {
        throw new CatalogInvariantError(
          'Duplicate variant combination for size and color in product',
        );
      }
      seenCombinations.add(key);

      const seenDurations = new Set<number>();
      for (const rate of variant.rentalRates) {
        if (seenDurations.has(rate.durationDays)) {
          throw new CatalogInvariantError('Duplicate rental rate duration for variant');
        }
        seenDurations.add(rate.durationDays);
      }
    }
    if (input.media.filter((m) => m.isPrimary).length > 1) {
      throw new CatalogInvariantError('Only one product image can be marked as primary');
    }
    await assertCatalogReferences(tx, shopId, input.categoryId, input.variants);
    const product = await tx.product.create({
      data: {
        shopId,
        categoryId: input.categoryId,
        code: input.code,
        name: input.name,
        description: input.description,
        defaultDepositAmount: input.defaultDepositAmount,
        replacementValue: input.replacementValue != null ? input.replacementValue : null,
        facebookPostUrl:
          input.facebookPostUrl != null && input.facebookPostUrl.trim() !== ''
            ? input.facebookPostUrl.trim()
            : null,
        isPublic: input.isPublic,
      },
    });

    for (const variantInput of input.variants) {
      await createVariantWithInventory(tx, shopId, product.id, variantInput);
    }

    if (input.media.length > 0) {
      await tx.productMedia.createMany({
        data: input.media.map((media) => ({ ...media, shopId, productId: product.id })),
      });
    }

    return tx.product.findUniqueOrThrow({
      where: { id: product.id },
      include: {
        variants: { include: { inventoryItems: true, rentalRates: true } },
        media: true,
      },
    });
  });
}
export async function addVariant(
  prisma: PrismaService,
  shopId: string,
  productId: string,
  input: CreateProductData['variants'][number],
): ReturnType<CatalogRepository['addVariant']> {
  return serializableTransaction(prisma, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, shopId, archivedAt: null, status: { not: 'ARCHIVED' } },
    });
    if (!product) return null;
    const existingVariants = await tx.productVariant.findMany({
      where: { productId, shopId, archivedAt: null },
    });
    const key = `${input.sizeId ?? 'null'}::${input.colorId ?? 'null'}`;
    for (const v of existingVariants) {
      if (`${v.sizeId ?? 'null'}::${v.colorId ?? 'null'}` === key) {
        throw new CatalogInvariantError(
          'Duplicate variant combination for size and color in product',
        );
      }
    }
    await assertVariantReferences(tx, shopId, input);
    const variant = await createVariantWithInventory(tx, shopId, productId, input);
    return tx.productVariant.findUnique({
      where: { id: variant.id },
      include: { rentalRates: true, inventoryItems: true, size: true, color: true },
    });
  });
}
export async function upsertRentalRate(
  prisma: PrismaService,
  shopId: string,
  variantId: string,
  input: { durationDays: number; price: number },
): ReturnType<CatalogRepository['upsertRentalRate']> {
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findFirst({
      where: {
        id: variantId,
        shopId,
        archivedAt: null,
        product: { shopId, archivedAt: null, status: { not: 'ARCHIVED' } },
      },
      select: { productId: true },
    });
    if (!variant) return null;
    // Partial uniqueness is SQL-owned: ON CONFLICT atomically inserts or updates
    // the single active price without touching inactive historical rows.
    const [saved] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO rental_rates (shop_id, product_id, variant_id, duration_days, price, updated_at)
      VALUES (${shopId}::uuid, ${variant.productId}::uuid, ${variantId}::uuid,
              ${input.durationDays}, ${input.price}, NOW())
      ON CONFLICT (shop_id, product_id, variant_id, duration_days)
        WHERE is_active = true AND variant_id IS NOT NULL
      DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()
      RETURNING id
    `;
    if (!saved) throw new Error('Rental rate upsert did not return a row');
    return tx.rentalRate.findUniqueOrThrow({ where: { id: saved.id } });
  });
}

export async function updateProduct(
  prisma: PrismaService,
  shopId: string,
  id: string,
  input: UpdateProductData,
): ReturnType<CatalogRepository['updateProduct']> {
  return serializableTransaction(prisma, async (tx) => {
    const existing = await tx.product.findFirst({
      where: { id, shopId, archivedAt: null },
    });
    if (!existing) return null;
    if (input.categoryId && input.categoryId !== existing.categoryId) {
      await assertActiveCategory(tx, shopId, input.categoryId);
    }
    const data: Prisma.ProductUpdateInput = {};
    if (input.status === 'ARCHIVED') {
      await assertProductCanArchive(tx, shopId, id);
      data.archivedAt = new Date();
    }
    if (input.name !== undefined) data.name = input.name;
    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId)
      data.category = { connect: { id: input.categoryId } };
    if (input.description !== undefined) data.description = input.description;
    if (input.defaultDepositAmount !== undefined)
      data.defaultDepositAmount = input.defaultDepositAmount;
    if (input.replacementValue !== undefined) data.replacementValue = input.replacementValue;
    if (input.facebookPostUrl !== undefined) {
      data.facebookPostUrl =
        input.facebookPostUrl != null && input.facebookPostUrl.trim() !== ''
          ? input.facebookPostUrl.trim()
          : null;
    }
    if (input.isPublic !== undefined) data.isPublic = input.isPublic;
    if (input.isRentable !== undefined) data.isRentable = input.isRentable;
    if (input.status !== undefined) data.status = input.status;

    return tx.product.update({ where: { id }, data });
  });
}

export async function archiveProduct(
  prisma: PrismaService,
  shopId: string,
  id: string,
): Promise<boolean> {
  return serializableTransaction(prisma, async (tx) => {
    const existing = await tx.product.findFirst({
      where: { id, shopId, archivedAt: null },
    });
    if (!existing) return false;

    await assertProductCanArchive(tx, shopId, id);

    await tx.product.update({
      where: { id },
      data: { archivedAt: new Date(), status: 'ARCHIVED' },
    });
    return true;
  });
}
async function assertProductCanArchive(
  tx: Prisma.TransactionClient,
  shopId: string,
  productId: string,
): Promise<void> {
  const allocation = await tx.rentalItemAllocation.findFirst({
    where: {
      shopId,
      inventoryItem: { variant: { productId, shopId } },
      ...activeOccupyingAllocationWhere(),
    },
    select: { id: true },
  });
  if (allocation)
    throw new CatalogInvariantError('Cannot archive product with active rental allocations');
}

export async function addProductMedia(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  productId: string,
  input: ProductMediaData,
): ReturnType<CatalogRepository['addProductMedia']> {
  const created = await serializableTransaction(prisma, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, shopId, archivedAt: null },
      select: { id: true },
    });
    if (!product) return null;
    if (input.isPrimary) {
      await tx.productMedia.updateMany({
        where: { shopId, productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.productMedia.create({ data: { shopId, productId, ...input } });
  });
  if (!created) return null;

  return {
    ...created,
    url: mediaUrls.resolve(created),
  };
}
export async function removeProductMedia(
  prisma: PrismaService,
  shopId: string,
  productId: string,
  mediaId: string,
): ReturnType<CatalogRepository['removeProductMedia']> {
  const deleted = await prisma.productMedia.deleteMany({
    where: { id: mediaId, shopId, productId },
  });
  return deleted.count === 1;
}
async function assertCatalogReferences(
  tx: Prisma.TransactionClient,
  shopId: string,
  categoryId: string,
  variants: CreateProductData['variants'],
): Promise<void> {
  await assertActiveCategory(tx, shopId, categoryId);
  for (const variant of variants) await assertVariantReferences(tx, shopId, variant);
}
async function assertActiveCategory(
  tx: Prisma.TransactionClient,
  shopId: string,
  categoryId: string,
): Promise<void> {
  const category = await tx.category.findFirst({
    where: { id: categoryId, shopId },
    select: { isActive: true },
  });
  if (!category) throw new CatalogCategoryError('CATEGORY_NOT_FOUND');
  if (!category.isActive) throw new CatalogCategoryError('CATEGORY_INACTIVE');
}
async function assertVariantReferences(
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

async function createVariantWithInventory(
  tx: Prisma.TransactionClient,
  shopId: string,
  productId: string,
  input: CreateProductData['variants'][number],
) {
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
    data: input.rentalRates.map((rate) => ({
      shopId,
      productId,
      variantId: variant.id,
      durationDays: rate.durationDays,
      price: rate.price,
    })),
  });
  const prefix = input.skuPrefix ?? input.variantCode;
  for (let index = 1; index <= input.inventoryCount; index += 1) {
    await tx.inventoryItem.create({
      data: {
        shopId,
        variantId: variant.id,
        sku: `${prefix}-${String(index).padStart(3, '0')}`,
      },
    });
  }
  return variant;
}
