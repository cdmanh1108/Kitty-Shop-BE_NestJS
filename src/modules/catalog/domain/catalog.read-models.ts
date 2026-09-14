import type { PaginatedResult } from '@common/types/pagination';
import type { DecimalValue } from '@common/types/decimal';

export interface ProductListItem {
  id: string;
  code: string;
  name: string;
  status: string;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  defaultDepositAmount: DecimalValue;
  variantCount: number;
  sizes: string[];
  colors: string[];
  minPrice: DecimalValue | null;
  maxPrice: DecimalValue | null;
}

export interface ProductLookupRate {
  durationDays: number;
  price: number;
}

export interface ProductLookupItem {
  id: string;
  code: string;
  name: string;
  status: string;
  rentalRates?: ProductLookupRate[];
  variants: Array<{
    id: string;
    variantCode: string;
    sizeName: string | null;
    colorName: string | null;
    rentalRates?: ProductLookupRate[];
  }>;
}

export type ProductLookupPage = PaginatedResult<ProductLookupItem>;

/** Global, unarchived shop inventory. Operational and occupancy counts overlap. */
export interface InventorySummary {
  total: number;
  available: number;
  occupied: number;
  needsAttention: number;
}

export interface InventoryHistoryItem {
  id: string;
  inventoryItemId: string;
  sku: string;
  productName: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedAt: Date;
}

export interface InventoryHistoryCriteria {
  shopId: string;
  productId?: string;
  inventoryItemId?: string;
  page: number;
  limit: number;
}

export type InventoryHistoryPage = PaginatedResult<InventoryHistoryItem>;
