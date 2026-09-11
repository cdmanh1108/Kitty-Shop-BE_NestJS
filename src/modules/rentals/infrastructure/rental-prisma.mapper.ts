import type { Prisma } from '@prisma/client';
import type { BookableVariant, RentalRepository } from '../domain/rental.repository';
import { availableInventoryWhere } from '../../catalog/infrastructure/inventory-availability';

export function bookableVariantInclude(
  input: Parameters<RentalRepository['getBookableVariant']>[0],
) {
  return {
    product: {
      include: {
        rentalRates: {
          where: { variantId: null, isActive: true, durationDays: input.durationDays },
        },
      },
    },
    size: true,
    color: true,
    rentalRates: { where: { isActive: true, durationDays: input.durationDays } },
    inventoryItems: {
      where: availableInventoryWhere(input),
      orderBy: [{ totalRentalCount: 'asc' }, { sku: 'asc' }],
    },
  } satisfies Prisma.ProductVariantInclude;
}

type BookableVariantRecord = Prisma.ProductVariantGetPayload<{
  include: ReturnType<typeof bookableVariantInclude>;
}>;

export function toBookableVariant(variant: BookableVariantRecord | null): BookableVariant | null {
  if (!variant) return null;
  const rate = variant.rentalRates[0] ?? variant.product.rentalRates[0];
  const deposit = variant.depositAmountOverride ?? variant.product.defaultDepositAmount;
  return {
    id: variant.id,
    variantCode: variant.variantCode,
    productId: variant.productId,
    productName: variant.product.name,
    sizeName: variant.size?.name ?? null,
    colorName: variant.color?.name ?? null,
    depositPerItem: Number(deposit),
    ratePrice: rate ? Number(rate.price) : null,
    availableInventory: variant.inventoryItems.map((item) => ({ id: item.id, sku: item.sku })),
  };
}
