import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogProductRepository } from '../domain/catalog-product.repository';
import type { ProductMediaUploadTarget } from '../domain/catalog.models';

export async function listProducts(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  input: Parameters<CatalogProductRepository['listProducts']>[0],
): ReturnType<CatalogProductRepository['listProducts']> {
  const where = {
    shopId: input.shopId,
    archivedAt: null,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.allowFreeAccessory !== undefined
      ? { allowFreeAccessory: input.allowFreeAccessory }
      : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: 'insensitive' as const } },
            { code: { contains: input.search, mode: 'insensitive' as const } },
            {
              variants: {
                some: {
                  inventoryItems: {
                    some: { sku: { contains: input.search, mode: 'insensitive' as const } },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        code: true,
        rentalPriceOverride: true,
        allowFreeAccessory: true,
        name: true,
        status: true,
        categoryId: true,
        defaultDepositAmount: true,
        category: { select: { name: true } },
        media: { where: { isPrimary: true }, take: 1, select: { storageKey: true, url: true } },
        variants: {
          where: { archivedAt: null },
          select: { size: { select: { name: true } }, color: { select: { name: true } } },
          orderBy: { variantCode: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.product.count({ where }),
  ]);
  return {
    items: items.map(({ category, media, variants, ...product }) => ({
      ...product,
      allowFreeAccessory: product.allowFreeAccessory,
      categoryName: category.name,
      imageUrl: media[0] ? mediaUrls.resolve(media[0]) : null,
      variantCount: variants.length,
      sizes: [...new Set(variants.flatMap((v) => (v.size ? [v.size.name] : [])))],
      colors: [...new Set(variants.flatMap((v) => (v.color ? [v.color.name] : [])))],
    })),
    meta: paginateMeta(input.page, input.limit, total),
  };
}

export async function lookupProducts(
  prisma: PrismaService,
  input: Parameters<CatalogProductRepository['lookupProducts']>[0],
): ReturnType<CatalogProductRepository['lookupProducts']> {
  const where = {
    shopId: input.shopId,
    archivedAt: null,
    ...(input.productId ? { id: input.productId } : {}),
    ...(input.allowFreeAccessory !== undefined
      ? { allowFreeAccessory: input.allowFreeAccessory }
      : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.search
      ? {
          OR: [
            { code: { contains: input.search, mode: 'insensitive' as const } },
            { name: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const limit = Math.min(50, Math.max(1, input.limit));
  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        code: true,
        rentalPriceOverride: true,
        allowFreeAccessory: true,
        name: true,
        status: true,
        variants: {
          where: { archivedAt: null },
          orderBy: { variantCode: 'asc' },
          select: {
            id: true,
            variantCode: true,
            size: { select: { name: true } },
            color: { select: { name: true } },
          },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (input.page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);
  return {
    items: items.map((p) => ({
      ...p,
      allowFreeAccessory: p.allowFreeAccessory,
      variants: p.variants.map(({ size, color, ...v }) => ({
        ...v,
        sizeName: size?.name ?? null,
        colorName: color?.name ?? null,
      })),
    })),
    meta: paginateMeta(input.page, limit, total),
  };
}

export async function findProduct(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  id: string,
): ReturnType<CatalogProductRepository['findProduct']> {
  const product = await prisma.product.findFirst({
    where: { id, shopId, archivedAt: null },
    select: {
      id: true,
      code: true,
      rentalPriceOverride: true,
      allowFreeAccessory: true,
      name: true,
      categoryId: true,
      description: true,
      defaultDepositAmount: true,
      replacementValue: true,
      facebookPostUrl: true,
      status: true,
      isRentable: true,
      isPublic: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, code: true, name: true, isActive: true } },
      media: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          storageKey: true,
          url: true,
          altText: true,
          isPrimary: true,
          sortOrder: true,
        },
      },
      variants: {
        select: {
          id: true,
          variantCode: true,
          sizeId: true,
          colorId: true,
          depositAmountOverride: true,
          status: true,
          archivedAt: true,
          size: { select: { id: true, code: true, name: true, sortOrder: true, isActive: true } },
          color: { select: { id: true, code: true, name: true, hexColor: true, isActive: true } },
          _count: { select: { inventoryItems: { where: { isActive: true } } } },
        },
      },
    },
  });

  if (!product) return null;

  return {
    ...product,
    allowFreeAccessory: product.allowFreeAccessory,
    category: {
      id: product.category.id,
      code: product.category.code,
      name: product.category.name,
      status: product.category.isActive ? 'ACTIVE' : 'INACTIVE',
    },
    media: product.media.map((m) => ({
      id: m.id,
      url: mediaUrls.resolve(m),
      altText: m.altText,
      isPrimary: m.isPrimary,
      sortOrder: m.sortOrder,
    })),
  };
}

export async function findProductMediaUploadTarget(
  prisma: PrismaService,
  shopId: string,
  productId: string,
): Promise<ProductMediaUploadTarget | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, shopId, archivedAt: null },
    select: { code: true, shop: { select: { code: true } } },
  });
  if (!product) return null;
  return { productCode: product.code, shopCode: product.shop.code };
}

export function countProductMediaByStorageKey(
  prisma: PrismaService,
  storageKey: string,
): ReturnType<CatalogProductRepository['countProductMediaByStorageKey']> {
  return prisma.productMedia.count({ where: { storageKey } });
}
