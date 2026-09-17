import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { CatalogRepository } from '../domain/catalog.repository';

export async function listProducts(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  input: Parameters<CatalogRepository['listProducts']>[0],
): ReturnType<CatalogRepository['listProducts']> {
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
  // One aggregation for the page, never one query per product. Preserve the
  // existing list's range over active rates, without transmitting rate rows.
  const prices = items.length
    ? await prisma.rentalRate.groupBy({
        by: ['productId'],
        where: {
          shopId: input.shopId,
          productId: { in: items.map((p) => p.id) },
          isActive: true,
          OR: [{ variantId: null }, { variant: { archivedAt: null } }],
        },
        _min: { price: true },
        _max: { price: true },
      })
    : [];
  const priceMap = new Map(prices.map((p) => [p.productId, p]));
  return {
    items: items.map(({ category, media, variants, ...product }) => ({
      ...product,
      categoryName: category.name,
      imageUrl: media[0] ? mediaUrls.resolve(media[0]) : null,
      variantCount: variants.length,
      sizes: [...new Set(variants.flatMap((v) => (v.size ? [v.size.name] : [])))],
      colors: [...new Set(variants.flatMap((v) => (v.color ? [v.color.name] : [])))],
      minPrice: priceMap.get(product.id)?._min.price ?? null,
      maxPrice: priceMap.get(product.id)?._max.price ?? null,
    })),
    meta: paginateMeta(input.page, input.limit, total),
  };
}

export async function lookupProducts(
  prisma: PrismaService,
  input: Parameters<CatalogRepository['lookupProducts']>[0],
): ReturnType<CatalogRepository['lookupProducts']> {
  const where = {
    shopId: input.shopId,
    archivedAt: null,
    ...(input.productId ? { id: input.productId } : {}),
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
        name: true,
        status: true,
        rentalRates: {
          where: { isActive: true },
          select: { durationDays: true, price: true },
        },
        variants: {
          where: { archivedAt: null },
          orderBy: { variantCode: 'asc' },
          select: {
            id: true,
            variantCode: true,
            size: { select: { name: true } },
            color: { select: { name: true } },
            rentalRates: {
              where: { isActive: true },
              select: { durationDays: true, price: true },
            },
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
    items: items.map((p) => {
      const productRates = p.rentalRates.map((r) => ({
        durationDays: r.durationDays,
        price: decimalToNumber(r.price),
      }));
      return {
        ...p,
        rentalRates: productRates,
        variants: p.variants.map(({ size, color, rentalRates, ...v }) => ({
          ...v,
          sizeName: size?.name ?? null,
          colorName: color?.name ?? null,
          rentalRates: rentalRates.length
            ? rentalRates.map((r) => ({
                durationDays: r.durationDays,
                price: decimalToNumber(r.price),
              }))
            : productRates,
        })),
      };
    }),
    meta: paginateMeta(input.page, limit, total),
  };
}

export async function findProduct(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  id: string,
): ReturnType<CatalogRepository['findProduct']> {
  const product = await prisma.product.findFirst({
    where: { id, shopId, archivedAt: null },
    select: {
      id: true,
      code: true,
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
      rentalRates: {
        where: { isActive: true },
        orderBy: { durationDays: 'asc' },
        select: { id: true, durationDays: true, price: true, currency: true, isActive: true },
      },
      variants: {
        select: {
          id: true,
          variantCode: true,
          sizeId: true,
          colorId: true,
          depositAmountOverride: true,
          status: true,
          size: { select: { name: true } },
          color: { select: { name: true, hexColor: true } },
          rentalRates: {
            where: { isActive: true },
            orderBy: { durationDays: 'asc' },
            select: { id: true, durationDays: true, price: true, currency: true, isActive: true },
          },
          _count: { select: { inventoryItems: { where: { isActive: true } } } },
        },
      },
    },
  });

  if (!product) return null;

  return {
    ...product,
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
