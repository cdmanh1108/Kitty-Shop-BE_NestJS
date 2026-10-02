import type { JsonValue } from '@common/types/json';

/** Rental-owned read capability consumed by Catalog's availability endpoint. */
export const RENTAL_AVAILABLE_INVENTORY_READER = Symbol('RENTAL_AVAILABLE_INVENTORY_READER');

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

export interface RentalAvailableInventoryReader {
  findAvailableInventory(input: {
    shopId: string;
    variantId: string;
    from: Date;
    until: Date;
  }): Promise<RentalAvailableInventoryItem[]>;
}
