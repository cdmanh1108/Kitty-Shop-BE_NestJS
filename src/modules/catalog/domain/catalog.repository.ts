export class CatalogInvariantError extends Error {}

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export interface CatalogRepository {
  listLookups(shopId: string): Promise<unknown>;
  createCategory(shopId: string, input: { code: string; name: string; parentId?: string }): Promise<unknown>;
  createSize(shopId: string, input: { code: string; name: string; sortOrder: number }): Promise<unknown>;
  createColor(shopId: string, input: { code: string; name: string; hexColor?: string }): Promise<unknown>;
  listProducts(input: { shopId: string; search?: string; categoryId?: string; status?: string; page: number; limit: number }): Promise<unknown>;
  findProduct(shopId: string, id: string): Promise<unknown | null>;
  createProduct(shopId: string, input: CreateProductData): Promise<unknown>;
  addVariant(shopId: string, productId: string, input: CreateProductData['variants'][number]): Promise<unknown | null>;
  upsertRentalRate(shopId: string, variantId: string, input: { durationDays: number; price: number }): Promise<unknown | null>;
  updateProduct(shopId: string, id: string, input: UpdateProductData): Promise<unknown | null>;
  addProductMedia(shopId: string, productId: string, input: ProductMediaData): Promise<unknown | null>;
  removeProductMedia(shopId: string, productId: string, mediaId: string): Promise<boolean>;
  addInventoryItem(shopId: string, input: AddInventoryData): Promise<unknown>;
  updateInventoryStatus(input: { shopId: string; id: string; status: string; condition?: string; reason?: string; notes?: string; changedBy: string }): Promise<unknown | null>;
  listInventory(input: { shopId: string; variantId?: string; status?: string; search?: string; page: number; limit: number }): Promise<unknown>;
  findInventoryItem(shopId: string, id: string): Promise<unknown | null>;
  findAvailableInventory(input: { shopId: string; variantId: string; from: Date; until: Date }): Promise<unknown[]>;
}

export interface CreateProductData {
  code: string;
  name: string;
  categoryId: string;
  description?: string;
  defaultDepositAmount: number;
  isPublic: boolean;
  variants: Array<{
    variantCode: string;
    sizeId?: string;
    colorId?: string;
    depositAmountOverride?: number;
    inventoryCount: number;
    skuPrefix?: string;
    rentalRates: Array<{ durationDays: number; price: number }>;
  }>;
  media: Array<{ url: string; altText?: string; isPrimary: boolean; sortOrder: number }>;
}

export interface UpdateProductData {
  name?: string;
  categoryId?: string;
  description?: string;
  defaultDepositAmount?: number;
  isPublic?: boolean;
  isRentable?: boolean;
  status?: string;
}

export interface AddInventoryData {
  variantId: string;
  locationId?: string;
  sku: string;
  barcode?: string;
  purchasePrice?: number;
  purchaseDate?: Date;
  notes?: string;
}

export interface ProductMediaData {
  url: string;
  altText?: string;
  isPrimary: boolean;
  sortOrder: number;
}
