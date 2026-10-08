import { toBookableVariant, bookableVariantInclude } from './rental-prisma.mapper';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { RentalAvailabilityReader } from '../domain/ports/rental-availability.port';
import type { RentalAvailableInventoryReader } from '../public/available-inventory-reader';
import { storefrontProductEligibility } from '@modules/catalog/public/storefront-eligibility';
import { availableInventoryWhere } from './rental-availability.query';

export async function findAvailableInventory(
  prisma: PrismaService,
  input: Parameters<RentalAvailableInventoryReader['findAvailableInventory']>[0],
): ReturnType<RentalAvailableInventoryReader['findAvailableInventory']> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      shopId: input.shopId,
      variantId: input.variantId,
      ...availableInventoryWhere(input),
    },
    orderBy: [{ totalRentalCount: 'asc' }, { sku: 'asc' }],
  });
  return items.map((item) => ({
    ...item,
    purchasePrice: item.purchasePrice?.toString() ?? null,
  }));
}
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
