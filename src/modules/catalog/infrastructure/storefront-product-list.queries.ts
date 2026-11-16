import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type {
  StorefrontProductItem,
  StorefrontProductListCriteria,
  StorefrontProductPage,
} from '../domain/catalog.models';
import {
  toStorefrontProductItem,
  storefrontProductBaseWhere,
  storefrontProductSelect,
  storefrontVariantBaseWhere,
} from './storefront-product.projection';

export async function listStorefrontProducts(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  input: StorefrontProductListCriteria,
  defaultRentalPrice: number,
): Promise<StorefrontProductPage> {
  const page = Math.min(1000, Math.max(1, input.page));
  const limit = Math.min(100, Math.max(1, input.limit));
  const skip = (page - 1) * limit;

  // Build Prisma where clause enforcing shop tenancy and public visibility
  const where: Prisma.ProductWhereInput = {
    ...storefrontProductBaseWhere(input.shopId, input.category, input.allowFreeAccessory),
  };

  if (input.q?.trim()) {
    const search = input.q.trim();
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const variantFilter: Prisma.ProductVariantWhereInput = {
    ...storefrontVariantBaseWhere(),
  };
  let hasVariantFilter = false;

  if (input.size?.trim()) {
    variantFilter.size = { name: { equals: input.size.trim(), mode: 'insensitive' } };
    hasVariantFilter = true;
  }

  if (input.color?.trim()) {
    variantFilter.color = { name: { equals: input.color.trim(), mode: 'insensitive' } };
    hasVariantFilter = true;
  }

  if (hasVariantFilter) {
    where.variants = { some: variantFilter };
  }

  let orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];
  if (input.sort === 'name_asc') orderBy = [{ name: 'asc' }, { id: 'asc' }];
  else if (input.sort === 'name_desc') orderBy = [{ name: 'desc' }, { id: 'desc' }];

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({ where, skip, take: limit, orderBy, select: storefrontProductSelect }),
    prisma.product.count({ where }),
  ]);
  const items: StorefrontProductItem[] = products.map((product) =>
    toStorefrontProductItem(product, mediaUrls, defaultRentalPrice),
  );

  return {
    items,
    meta: paginateMeta(page, limit, total),
  };
}
