import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { Prisma } from '@prisma/client';
import type { StorefrontProductItem, StorefrontRentalPrice } from '../domain/catalog.models';
import {
  storefrontProductEligibility,
  storefrontVariantEligibility,
} from '../domain/storefront-eligibility';

export function storefrontProductBaseWhere(
  shopId: string,
  category?: string,
): Prisma.ProductWhereInput {
  const value = category?.trim();
  const categoryFilters: Prisma.CategoryWhereInput[] = value
    ? [
        { code: { equals: value, mode: 'insensitive' } },
        { slug: { equals: value, mode: 'insensitive' } },
      ]
    : [];
  if (value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    categoryFilters.push({ id: value });
  }
  return {
    shopId,
    ...storefrontProductEligibility,
    ...(categoryFilters.length ? { category: { OR: categoryFilters } } : {}),
  };
}

export function storefrontVariantBaseWhere(): Prisma.ProductVariantWhereInput {
  return {
    ...storefrontVariantEligibility,
  };
}

export function extractRentalPrices(
  productRates?: Array<{ durationDays: number; price: unknown }>,
  variantRates?: Array<Array<{ durationDays: number; price: unknown }>>,
): StorefrontRentalPrice[] {
  const map = new Map<number, number>();

  if (productRates?.length) {
    for (const r of productRates) {
      if (!map.has(r.durationDays)) {
        map.set(r.durationDays, decimalToNumber(r.price as number | Prisma.Decimal));
      }
    }
  } else if (variantRates?.length) {
    for (const vrList of variantRates) {
      for (const r of vrList) {
        if (!map.has(r.durationDays)) {
          map.set(r.durationDays, decimalToNumber(r.price as number | Prisma.Decimal));
        }
      }
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([days, amount]) => ({ days, amount }));
}

export const storefrontProductSelect = {
  id: true,
  code: true,
  slug: true,
  name: true,
  categoryId: true,
  defaultDepositAmount: true,
  isRentable: true,
  category: { select: { name: true } },
  media: {
    where: { OR: [{ variantId: null }, { variant: storefrontVariantBaseWhere() }] },
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    take: 1,
    select: { storageKey: true, url: true, isPrimary: true },
  },
  rentalRates: {
    where: {
      isActive: true,
      OR: [{ variantId: null }, { variant: storefrontVariantBaseWhere() }],
    },
    orderBy: { durationDays: 'asc' as const },
    select: { durationDays: true, price: true },
  },
  variants: {
    where: storefrontVariantBaseWhere(),
    select: {
      size: { select: { name: true } },
      color: { select: { name: true } },
      rentalRates: {
        where: { isActive: true },
        orderBy: { durationDays: 'asc' as const },
        select: { durationDays: true, price: true },
      },
    },
  },
};

export type StorefrontProductRecord = Prisma.ProductGetPayload<{
  select: typeof storefrontProductSelect;
}>;

export function toStorefrontProductItem(
  product: StorefrontProductRecord,
  mediaUrls: PublicMediaUrlResolver,
): StorefrontProductItem {
  const primaryMediaObj = product.media[0] ?? null;
  const imageUrl = primaryMediaObj ? mediaUrls.resolve(primaryMediaObj) : '';
  const sizes = Array.from(
    new Set(product.variants.map((v) => v.size?.name).filter((s): s is string => Boolean(s))),
  );
  const colors = Array.from(
    new Set(product.variants.map((v) => v.color?.name).filter((c): c is string => Boolean(c))),
  );
  return {
    id: product.id,
    code: product.code,
    slug: product.slug,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? 'Sản phẩm',
    imageUrl,
    size: sizes.join(', ') || 'Free size',
    color: colors.join(', ') || 'Nhiều màu',
    rentalPrices: extractRentalPrices(
      product.rentalRates,
      product.variants.map((v) => v.rentalRates),
    ),
    depositAmount: decimalToNumber(product.defaultDepositAmount),
    isRentable: product.isRentable,
  };
}
