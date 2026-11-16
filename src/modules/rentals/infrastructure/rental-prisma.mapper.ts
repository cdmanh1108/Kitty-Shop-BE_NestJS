import { decimalToNumber } from '@database/prisma/decimal-mapping';
import type { Prisma } from '@prisma/client';
import type {
  BookableVariant,
  RentalGetBookableVariantData,
} from '../domain/ports/rental-availability.port';
import { availableInventoryWhere } from './rental-availability.query';

export function bookableVariantInclude(
  input: Pick<RentalGetBookableVariantData, 'from' | 'until'>,
) {
  return {
    product: true,
    size: true,
    color: true,
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
  const depositPerItem = decimalToNumber(
    variant.depositAmountOverride ?? variant.product.defaultDepositAmount,
  );

  return {
    id: variant.id,
    variantCode: variant.variantCode,
    productId: variant.productId,
    productName: variant.product.name,
    allowFreeAccessory: variant.product.allowFreeAccessory,
    sizeName: variant.size?.name ?? null,
    colorName: variant.color?.name ?? null,
    depositPerItem,
    availableInventory: variant.inventoryItems.map((item) => ({ id: item.id, sku: item.sku })),
  };
}
