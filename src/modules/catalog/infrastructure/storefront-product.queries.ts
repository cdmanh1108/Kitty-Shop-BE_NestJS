import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { StorefrontProductDetails, StorefrontProductItem } from '../domain/catalog.models';
import {
  extractRentalPrices,
  storefrontProductBaseWhere,
  storefrontProductSelect,
  storefrontVariantBaseWhere,
  toStorefrontProductItem,
} from './storefront-product.projection';

export async function listStorefrontProductsByIds(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  productIds: string[],
): Promise<StorefrontProductItem[]> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { ...storefrontProductBaseWhere(shopId), id: { in: ids } },
    select: storefrontProductSelect,
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  return ids.flatMap((id) => {
    const product = byId.get(id);
    return product ? [toStorefrontProductItem(product, mediaUrls)] : [];
  });
}

export async function findStorefrontProductBySlug(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  slug: string,
): Promise<StorefrontProductDetails | null> {
  const product = await prisma.product.findFirst({
    where: {
      ...storefrontProductBaseWhere(shopId),
      slug: slug.trim(),
    },
    select: {
      id: true,
      code: true,
      allowFreeAccessory: true,
      slug: true,
      name: true,
      categoryId: true,
      description: true,
      defaultDepositAmount: true,
      facebookPostUrl: true,
      isRentable: true,
      category: { select: { name: true } },
      media: {
        where: {
          OR: [{ variantId: null }, { variant: storefrontVariantBaseWhere() }],
        },
        orderBy: { sortOrder: 'asc' },
        select: { storageKey: true, url: true, isPrimary: true },
      },
      rentalRates: {
        where: {
          isActive: true,
          OR: [{ variantId: null }, { variant: storefrontVariantBaseWhere() }],
        },
        orderBy: { durationDays: 'asc' },
        select: { durationDays: true, price: true },
      },
      variants: {
        where: storefrontVariantBaseWhere(),
        select: {
          id: true,
          variantCode: true,
          depositAmountOverride: true,
          size: { select: { name: true } },
          color: { select: { name: true } },
          rentalRates: {
            where: { isActive: true },
            orderBy: { durationDays: 'asc' },
            select: { durationDays: true, price: true },
          },
        },
      },
    },
  });

  if (!product) {
    return null;
  }

  const primaryMediaObj = product.media.find((m) => m.isPrimary) ?? product.media[0] ?? null;
  const imageUrl = primaryMediaObj ? mediaUrls.resolve(primaryMediaObj) : '';
  const gallery = product.media.map((m) => mediaUrls.resolve(m)).filter(Boolean);

  const sizes = Array.from(
    new Set(product.variants.map((v) => v.size?.name).filter((s): s is string => Boolean(s))),
  );
  const colors = Array.from(
    new Set(product.variants.map((v) => v.color?.name).filter((c): c is string => Boolean(c))),
  );

  const rentalPrices = extractRentalPrices(
    product.rentalRates,
    product.variants.map((v) => v.rentalRates),
  );

  const baseDepositAmount = decimalToNumber(product.defaultDepositAmount);

  const variants = product.variants.map((v) => ({
    id: v.id,
    code: v.variantCode,
    size: v.size?.name ?? null,
    color: v.color?.name ?? null,
    depositAmount: v.depositAmountOverride
      ? decimalToNumber(v.depositAmountOverride)
      : baseDepositAmount,
  }));

  return {
    id: product.id,
    code: product.code,
    allowFreeAccessory: product.allowFreeAccessory,
    slug: product.slug,
    name: product.name,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? 'Sản phẩm',
    imageUrl,
    gallery: gallery.length ? gallery : imageUrl ? [imageUrl] : [],
    size: sizes.join(', ') || 'Free size',
    color: colors.join(', ') || 'Nhiều màu',
    rentalPrices,
    depositAmount: baseDepositAmount,
    isRentable: product.isRentable,
    description: product.description,
    facebookPostUrl: product.facebookPostUrl,
    variants,
  };
}
