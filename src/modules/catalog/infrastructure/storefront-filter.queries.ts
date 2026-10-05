import type { PrismaService } from '@database/prisma/prisma.service';
import type {
  StorefrontCatalogFilters,
  StorefrontCatalogFiltersCriteria,
} from '../domain/catalog.models';
import {
  storefrontProductBaseWhere,
  storefrontVariantBaseWhere,
} from './storefront-product.projection';

/** Complete attribute options for eligible public variants, independent of product pagination. */
export async function listStorefrontFilters(
  prisma: PrismaService,
  input: StorefrontCatalogFiltersCriteria,
): Promise<StorefrontCatalogFilters> {
  const variants = {
    some: {
      shopId: input.shopId,
      ...storefrontVariantBaseWhere(),
      product: storefrontProductBaseWhere(input.shopId, input.category),
    },
  };
  const [sizes, colors] = await prisma.$transaction([
    prisma.size.findMany({
      where: { shopId: input.shopId, isActive: true, variants },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true, sortOrder: true },
    }),
    prisma.color.findMany({
      where: { shopId: input.shopId, isActive: true, variants },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true, hexColor: true },
    }),
  ]);
  return { sizes, colors };
}
