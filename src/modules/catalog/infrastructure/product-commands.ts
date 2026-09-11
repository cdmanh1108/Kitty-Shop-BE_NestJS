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
    const seenCombinations = new Set<string>();
    for (const variant of input.variants) {
      const key = `${variant.sizeId ?? 'null'}::${variant.colorId ?? 'null'}`;
      if (seenCombinations.has(key)) {
        throw new CatalogInvariantError('Duplicate variant combination for size and color in product');
      }
      seenCombinations.add(key);
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
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId, archivedAt: null },
  });
  if (!product) return null;
  return prisma.$transaction(async (tx) => {
    const existingVariants = await tx.productVariant.findMany({
      where: { productId, shopId, archivedAt: null },
    });
    const key = `${input.sizeId ?? 'null'}::${input.colorId ?? 'null'}`;
    for (const v of existingVariants) {
      if (`${v.sizeId ?? 'null'}::${v.colorId ?? 'null'}` === key) {
        throw new CatalogInvariantError('Duplicate variant combination for size and color in product');
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
  const data: Prisma.ProductUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
  if (input.description !== undefined) data.description = input.description;
  if (input.defaultDepositAmount !== undefined) data.defaultDepositAmount = input.defaultDepositAmount;
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

  return prisma.product.update({ where: { id }, data });
}
export async function archiveProduct(
  prisma: PrismaService,
  shopId: string,
  id: string,
): Promise<boolean> {
  const existing = await prisma.product.findFirst({
    where: { id, shopId, archivedAt: null },
    include: {
      variants: {
        include: {
          orderItems: {
            where: {
              status: { in: ['RESERVED', 'RENTING', 'OVERDUE'] },
            },
          },
        },
      },
    },
  });
  if (!existing) return false;
  const hasActiveRentals = existing.variants.some((v) => v.orderItems.length > 0);
  if (hasActiveRentals) {
    throw new CatalogInvariantError('Cannot archive product with active rental orders');
  }
  await prisma.product.update({
    where: { id },
    data: { archivedAt: new Date(), status: 'ARCHIVED' },
  });
  return true;
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
