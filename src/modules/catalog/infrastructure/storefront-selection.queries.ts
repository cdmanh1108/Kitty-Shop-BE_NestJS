import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import type { PrismaService } from '@database/prisma/prisma.service';
import type {
  StorefrontSelectionInput,
  StorefrontSelectionResolution,
} from '../domain/catalog.models';
import {
  storefrontProductEligibility,
  storefrontVariantEligibility,
} from '../domain/storefront-eligibility';

type StorefrontSelectionQuery = {
  shopId: string;
  selections: StorefrontSelectionInput[];
};

const productMediaSelect = {
  where: { variantId: null },
  orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
  take: 1,
  select: { storageKey: true, url: true },
};

const variantMediaSelect = {
  orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
  take: 1,
  select: { storageKey: true, url: true },
};

/** Resolves exact cart variant identities in one bounded read. */
export async function resolveStorefrontSelections(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  input: StorefrontSelectionQuery,
): Promise<StorefrontSelectionResolution[]> {
  if (input.selections.length === 0) return [];

  const variantIds = [...new Set(input.selections.map(({ variantId }) => variantId))];
  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: variantIds },
      shopId: input.shopId,
      ...storefrontVariantEligibility,
      product: { shopId: input.shopId, ...storefrontProductEligibility },
    },
    select: {
      id: true,
      productId: true,
      variantCode: true,
      size: { select: { name: true } },
      color: { select: { name: true } },
      media: variantMediaSelect,
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          allowFreeAccessory: true,
          media: productMediaSelect,
        },
      },
    },
  });
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
  const imageUrl = (media: Array<{ storageKey: string | null; url: string }>): string | null => {
    const first = media[0];
    return first ? mediaUrls.resolve(first) : null;
  };

  return input.selections.map((selection, index): StorefrontSelectionResolution => {
    const variant = variantsById.get(selection.variantId);
    if (!variant || (selection.productId && selection.productId !== variant.productId)) {
      return { status: 'UNAVAILABLE', index, quantity: selection.quantity };
    }

    return {
      status: 'RESOLVED',
      index,
      quantity: selection.quantity,
      product: {
        id: variant.product.id,
        slug: variant.product.slug,
        name: variant.product.name,
        allowFreeAccessory: variant.product.allowFreeAccessory,
      },
      variant: {
        id: variant.id,
        code: variant.variantCode,
        size: variant.size?.name ?? null,
        color: variant.color?.name ?? null,
      },
      imageUrl: imageUrl(variant.media) ?? imageUrl(variant.product.media),
    };
  });
}
