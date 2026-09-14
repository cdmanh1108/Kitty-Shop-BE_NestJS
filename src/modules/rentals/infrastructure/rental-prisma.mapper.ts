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
          where: { variantId: null, isActive: true },
          orderBy: { durationDays: 'asc' },
        },
      },
    },
    size: true,
    color: true,
    rentalRates: {
      where: { isActive: true },
      orderBy: { durationDays: 'asc' },
    },
    inventoryItems: {
      where: availableInventoryWhere(input),
      orderBy: [{ totalRentalCount: 'asc' }, { sku: 'asc' }],
    },
  } satisfies Prisma.ProductVariantInclude;
}

type BookableVariantRecord = Prisma.ProductVariantGetPayload<{
  include: ReturnType<typeof bookableVariantInclude>;
}>;

export function toBookableVariant(
  variant: BookableVariantRecord | null,
  durationDays = 1,
): BookableVariant | null {
  if (!variant) return null;
  // Partial unique indexes guarantee one active row per duration in each scope.
  // Variant-specific pricing takes precedence over the product fallback.
  const days = Math.max(1, durationDays);
  const findRate = (d: number) =>
    variant.rentalRates.find((r) => r.durationDays === d) ??
    variant.product.rentalRates.find((r) => r.durationDays === d);

  const exactRate = findRate(days);
  let ratePrice: number | null = null;

  if (exactRate) {
    ratePrice = decimalToNumber(exactRate.price);
  } else {
    const dailyRate = findRate(1);
    if (dailyRate) {
      ratePrice = decimalToNumber(dailyRate.price) * days;
    } else {
      const anyRate = variant.rentalRates[0] ?? variant.product.rentalRates[0];
      if (anyRate && anyRate.durationDays > 0) {
        const perDay = decimalToNumber(anyRate.price) / anyRate.durationDays;
        ratePrice = Math.round(perDay * days);
      }
    }
  }

  const deposit = variant.depositAmountOverride ?? variant.product.defaultDepositAmount;
  return {
    id: variant.id,
    variantCode: variant.variantCode,
    productId: variant.productId,
    productName: variant.product.name,
    sizeName: variant.size?.name ?? null,
    colorName: variant.color?.name ?? null,
    depositPerItem: decimalToNumber(deposit),
    ratePrice,
    availableInventory: variant.inventoryItems.map((item) => ({ id: item.id, sku: item.sku })),
  };
}
