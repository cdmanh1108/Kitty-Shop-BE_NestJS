import type { InventoryStatus } from './catalog-status';

export interface AddInventoryData {
  variantId: string;
  locationId?: string;
  sku?: string;
  barcode?: string;
  purchasePrice?: number;
  purchaseDate?: Date;
  notes?: string;
  changedBy?: string;
}

export interface CatalogUpdateInventoryStatusData {
  shopId: string;
  id: string;
  status: InventoryStatus;
  expectedFromStatus?: InventoryStatus;
  condition?: string;
  reason?: string;
  notes?: string;
  changedBy: string;
}

export interface CatalogListInventoryCriteria {
  shopId: string;
  variantId?: string;
  productId?: string;
  categoryId?: string;
  status?: string;
  search?: string;
  page: number;
  limit: number;
}
