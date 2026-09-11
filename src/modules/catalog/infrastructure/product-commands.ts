import type { PrismaService } from '@database/prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  CatalogRepository,
  CreateProductData,
  ProductMediaData,
  UpdateProductData,
} from '../domain/catalog.repository';
import { CatalogInvariantError } from '../domain/catalog.repository';

export function createProduct(
  prisma: PrismaService,
  shopId: string,
  input: CreateProductData,
): ReturnType<CatalogRepository['createProduct']> {
  return prisma.$transaction(async (tx) => {
    await assertCatalogReferences(tx, shopId, input.categoryId, input.variants);
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
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId, archivedAt: null },
  });
  if (!product) return null;
  return prisma.$transaction(async (tx) => {
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
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, shopId, archivedAt: null },
  });
  if (!variant) return null;
  const existing = await prisma.rentalRate.findFirst({
    where: { shopId, variantId, durationDays: input.durationDays, isActive: true },
  });
  if (existing) {
    return prisma.rentalRate.update({
      where: { id: existing.id },
      data: { price: input.price },
    });
  }
  return prisma.rentalRate.create({
    data: {
      shopId,
      productId: variant.productId,
      variantId,
      durationDays: input.durationDays,
      price: input.price,
    },
  });
}
export async function updateProduct(
  prisma: PrismaService,
  shopId: string,
  id: string,
  input: UpdateProductData,
): ReturnType<CatalogRepository['updateProduct']> {
  const existing = await prisma.product.findFirst({
    where: { id, shopId, archivedAt: null },
  });
  if (!existing) return null;
  if (input.categoryId) {
    const category = await prisma.category.count({
      where: { id: input.categoryId, shopId, isActive: true },
    });
    if (!category)
      throw new CatalogInvariantError('Category does not belong to this shop or is inactive');
  }
  return prisma.product.update({ where: { id }, data: input });
}
export async function addProductMedia(
  prisma: PrismaService,
  shopId: string,
  productId: string,
  input: ProductMediaData,
): ReturnType<CatalogRepository['addProductMedia']> {
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId, archivedAt: null },
  });
  if (!product) return null;
  return prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.productMedia.updateMany({
        where: { shopId, productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.productMedia.create({ data: { shopId, productId, ...input } });
  });
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
  const category = await tx.category.count({ where: { id: categoryId, shopId, isActive: true } });
  if (!category)
    throw new CatalogInvariantError('Category does not belong to this shop or is inactive');
  for (const variant of variants) await assertVariantReferences(tx, shopId, variant);
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
