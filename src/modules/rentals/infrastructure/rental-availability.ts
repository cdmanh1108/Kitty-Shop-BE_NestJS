import { toBookableVariant, bookableVariantInclude } from './rental-prisma.mapper';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { RentalAvailabilityReader } from '../domain/ports/rental-availability.port';
import { storefrontProductEligibility } from '@modules/catalog/domain/storefront-eligibility';

export async function getBookableVariant(
  prisma: PrismaService,
  input: Parameters<RentalAvailabilityReader['getBookableVariant']>[0],
): ReturnType<RentalAvailabilityReader['getBookableVariant']> {
  const variant = await prisma.productVariant.findFirst({
    where: {
      id: input.variantId,
      shopId: input.shopId,
      status: 'ACTIVE',
      archivedAt: null,
      product: input.storefrontEligibility
        ? storefrontProductEligibility
        : { status: 'ACTIVE', isRentable: true, archivedAt: null },
    },
    include: bookableVariantInclude(input),
  });
  return toBookableVariant(variant, input.durationDays);
}

export async function getBookableVariants(
  prisma: PrismaService,
  input: Parameters<RentalAvailabilityReader['getBookableVariants']>[0],
): ReturnType<RentalAvailabilityReader['getBookableVariants']> {
  const variantIds = [...new Set(input.variantIds)];
  if (variantIds.length === 0) return [];

  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: variantIds },
      shopId: input.shopId,
      status: 'ACTIVE',
      archivedAt: null,
      product: input.storefrontEligibility
        ? storefrontProductEligibility
        : { status: 'ACTIVE', isRentable: true, archivedAt: null },
    },
    include: bookableVariantInclude(input),
  });
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  // Prisma does not promise findMany ordering. Preserve caller order for stable line correlation.
  return variantIds.flatMap((variantId) => {
    const variant = variantById.get(variantId);
    const bookable = toBookableVariant(variant ?? null, input.durationDays);
    return bookable ? [bookable] : [];
  });
}

export async function findActiveVariantIdsByProduct(
  prisma: PrismaService,
  shopId: string,
  productId: string,
  storefrontEligibility = false,
): Promise<string[]> {
  const result = await findActiveVariantIdsByProducts(
    prisma,
    shopId,
    [productId],
    storefrontEligibility,
  );
  return result[productId] ?? [];
}

export async function findActiveVariantIdsByProducts(
  prisma: PrismaService,
  shopId: string,
  productIds: readonly string[],
  storefrontEligibility = false,
): Promise<Record<string, string[]>> {
  const uniqueProductIds = [...new Set(productIds)];
  if (uniqueProductIds.length === 0) return {};

  const variants = await prisma.productVariant.findMany({
    where: {
      productId: { in: uniqueProductIds },
      shopId,
      status: 'ACTIVE',
      archivedAt: null,
      ...(storefrontEligibility ? { product: storefrontProductEligibility } : {}),
    },
    select: { id: true, productId: true },
  });
  const idsByProduct = new Map(uniqueProductIds.map((productId) => [productId, [] as string[]]));
  for (const variant of variants) idsByProduct.get(variant.productId)?.push(variant.id);
  return Object.fromEntries(idsByProduct);
}
