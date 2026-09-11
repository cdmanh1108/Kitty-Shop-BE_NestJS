import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { Prisma } from '@prisma/client';
import type { BookableVariant, RentalRepository } from '../domain/rental.repository';
import { availableInventoryWhere } from '@database/prisma/inventory-availability';

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
  // Partial unique indexes guarantee one active row per duration in each scope.
  // Variant-specific pricing takes precedence over the product fallback.
  const [variantRate] = variant.rentalRates;
  const [productRate] = variant.product.rentalRates;
  const rate = variantRate ?? productRate;
  const deposit = variant.depositAmountOverride ?? variant.product.defaultDepositAmount;
  return {
    id: variant.id,
    variantCode: variant.variantCode,
    productId: variant.productId,
    productName: variant.product.name,
    sizeName: variant.size?.name ?? null,
    colorName: variant.color?.name ?? null,
    depositPerItem: decimalToNumber(deposit),
    ratePrice: rate ? decimalToNumber(rate.price) : null,
    availableInventory: variant.inventoryItems.map((item) => ({ id: item.id, sku: item.sku })),
  };
}
