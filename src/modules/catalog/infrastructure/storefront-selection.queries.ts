import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import type { PrismaService } from '@database/prisma/prisma.service';
import type {
  StorefrontSelectionInput,
  StorefrontSelectionResolution,
} from '../domain/catalog.models';
import { storefrontProductEligibility, storefrontVariantEligibility } from '../domain/storefront-eligibility';

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

/**
 * Resolves only identities supplied by a cart. This is intentionally separate
 * from storefront discovery pagination and does not decide price or stock.
 *
 * Product-only inputs preserve C09 compatibility: at most two eligible
 * variants are read so the adapter can prove "exactly one" without loading a
 * product's entire variant set. Explicit variants are fetched as an ID set.
 */
export async function resolveStorefrontSelections(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  input: StorefrontSelectionQuery,
): Promise<StorefrontSelectionResolution[]> {
  if (input.selections.length === 0) return [];

  const productOnlyIds = [
    ...new Set(
      input.selections
        .filter((selection) => selection.productId && !selection.variantId)
        .map((selection) => selection.productId as string),
    ),
  ];
  const explicitVariantIds = [
    ...new Set(
      input.selections
        .map((selection) => selection.variantId)
        .filter((variantId): variantId is string => Boolean(variantId)),
    ),
  ];

  const [legacyProducts, explicitVariants] = await Promise.all([
    productOnlyIds.length
      ? prisma.product.findMany({
          where: {
            id: { in: productOnlyIds },
            shopId: input.shopId,
            ...storefrontProductEligibility,
          },
          select: {
            id: true,
            slug: true,
            name: true,
            media: productMediaSelect,
            variants: {
              where: { shopId: input.shopId, ...storefrontVariantEligibility },
              orderBy: { id: 'asc' },
              take: 2,
              select: {
                id: true,
                variantCode: true,
                size: { select: { name: true } },
                color: { select: { name: true } },
                media: variantMediaSelect,
              },
            },
          },
        })
      : [],
    explicitVariantIds.length
      ? prisma.productVariant.findMany({
          where: {
            id: { in: explicitVariantIds },
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
                media: productMediaSelect,
              },
            },
          },
        })
      : [],
  ]);

  const legacyByProductId = new Map(legacyProducts.map((product) => [product.id, product]));
  const explicitByVariantId = new Map(explicitVariants.map((variant) => [variant.id, variant]));
  const imageUrl = (media: Array<{ storageKey: string | null; url: string }>): string | null => {
    const first = media[0];
    return first ? mediaUrls.resolve(first) : null;
  };

  return input.selections.map((selection, index): StorefrontSelectionResolution => {
    if (selection.variantId) {
      const variant = explicitByVariantId.get(selection.variantId);
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
        },
        variant: {
          id: variant.id,
          code: variant.variantCode,
          size: variant.size?.name ?? null,
          color: variant.color?.name ?? null,
        },
        imageUrl: imageUrl(variant.media) ?? imageUrl(variant.product.media),
      };
    }

    const product = selection.productId ? legacyByProductId.get(selection.productId) : undefined;
    if (!product) return { status: 'UNAVAILABLE', index, quantity: selection.quantity };

    const productImageUrl = imageUrl(product.media);
    if (product.variants.length !== 1) {
      return {
        status: 'SELECTION_REQUIRED',
        index,
        quantity: selection.quantity,
        product: { id: product.id, slug: product.slug, name: product.name },
        imageUrl: productImageUrl,
      };
    }

    const variant = product.variants[0];
    // Defensive only: the length check above is the C09 compatibility rule.
    if (!variant) return { status: 'UNAVAILABLE', index, quantity: selection.quantity };
    return {
      status: 'RESOLVED',
      index,
      quantity: selection.quantity,
      product: { id: product.id, slug: product.slug, name: product.name },
      variant: {
        id: variant.id,
        code: variant.variantCode,
        size: variant.size?.name ?? null,
        color: variant.color?.name ?? null,
      },
      imageUrl: imageUrl(variant.media) ?? productImageUrl,
    };
  });
}
