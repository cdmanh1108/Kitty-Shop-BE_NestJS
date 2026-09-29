import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { Prisma } from '@prisma/client';
import type { BookableVariant, RentalAvailabilityReader } from '../domain/rental.repository';
import { resolveRentalPricing } from '../domain/rental-pricing';
import { availableInventoryWhere } from '@database/prisma/inventory-availability';

export function bookableVariantInclude(
  input: Parameters<RentalAvailabilityReader['getBookableVariant']>[0],
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
  const pricing = resolveRentalPricing({
    durationDays,
    variantRates: variant.rentalRates.map((rate) => ({
      durationDays: rate.durationDays,
      price: decimalToNumber(rate.price),
    })),
    productRates: variant.product.rentalRates.map((rate) => ({
      durationDays: rate.durationDays,
      price: decimalToNumber(rate.price),
    })),
    variantDepositOverride:
      variant.depositAmountOverride === null
        ? null
        : decimalToNumber(variant.depositAmountOverride),
    productDefaultDeposit: decimalToNumber(variant.product.defaultDepositAmount),
  });

  return {
    id: variant.id,
    variantCode: variant.variantCode,
    productId: variant.productId,
    productName: variant.product.name,
    sizeName: variant.size?.name ?? null,
    colorName: variant.color?.name ?? null,
    depositPerItem: pricing.depositPerItem,
    ratePrice: pricing.ratePrice,
    availableInventory: variant.inventoryItems.map((item) => ({ id: item.id, sku: item.sku })),
  };
}
