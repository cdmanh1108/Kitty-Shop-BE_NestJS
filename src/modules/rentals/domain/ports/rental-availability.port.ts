import type { JsonValue } from '@common/types/json';

export interface BookableVariant {
  id: string;
  variantCode: string;
  productId: string;
  productName: string;
  sizeName: string | null;
  colorName: string | null;
  depositPerItem: number;
  ratePrice: number | null;
  availableInventory: Array<{ id: string; sku: string }>;
}

/** Stable read contract for the Catalog admin inventory-availability endpoint. */
export interface RentalAvailableInventoryItem {
  id: string;
  shopId: string;
  variantId: string;
  locationId: string | null;
  sku: string;
  barcode: string | null;
  currentStatus: string;
  condition: string;
  purchasePrice: string | null;
  purchaseDate: Date | null;
  acquiredFrom: string | null;
  totalRentalCount: number;
  lastRentedAt: Date | null;
  notes: string | null;
  metadata: JsonValue | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export const RENTAL_AVAILABILITY_READER = Symbol('RENTAL_AVAILABILITY_READER');

export interface RentalAvailabilityReader {
  findAvailableInventory(input: {
    shopId: string;
    variantId: string;
    from: Date;
    until: Date;
  }): Promise<RentalAvailableInventoryItem[]>;
  getBookableVariant(input: RentalGetBookableVariantData): Promise<BookableVariant | null>;
  getBookableVariants(input: RentalGetBookableVariantsData): Promise<BookableVariant[]>;
  findActiveVariantIdsByProduct(
    shopId: string,
    productId: string,
    storefrontEligibility?: boolean,
  ): Promise<string[]>;
  findActiveVariantIdsByProducts(
    shopId: string,
    productIds: readonly string[],
    storefrontEligibility?: boolean,
  ): Promise<Record<string, string[]>>;
}

export interface RentalGetBookableVariantData {
  shopId: string;
  variantId: string;
  durationDays: number;
  from: Date;
  until: Date;
  /** Server-owned context set only by the Web rental application service. */
  storefrontEligibility?: true;
}

export interface RentalGetBookableVariantsData
  extends Omit<RentalGetBookableVariantData, 'variantId'> {
  variantIds: readonly string[];
}
