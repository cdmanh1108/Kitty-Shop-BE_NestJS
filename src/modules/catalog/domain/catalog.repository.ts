import type {
  ProductLookupPage,
  InventorySummary,
  InventoryHistoryPage,
  InventoryHistoryCriteria,
} from './catalog.read-models';
import type { InventoryStatus } from '@modules/catalog/domain/catalog-status';
import { type ColorRecord, type SizeRecord } from '@modules/catalog/domain/catalog.records';

import type {
  AddInventoryItemResult,
  AddProductMediaResult,
  AddVariantResult,
  CatalogLookups,
  CategoryListItem,
  CategoryPage,
  CategoryOption,
  CreateProductResult,
  FindAvailableInventoryResult,
  InventoryDetails,
  InventoryPage,
  ProductDetails,
  ProductPage,
  StorefrontCategory,
  StorefrontProductDetails,
  StorefrontProductListCriteria,
  StorefrontProductPage,
  UpdateProductResult,
  UpsertRentalRateResult,
} from './catalog.models';
export const CATALOG_ERROR_CODE = {
  CATEGORY_CODE_ALREADY_EXISTS: 'CATEGORY_CODE_ALREADY_EXISTS',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CATEGORY_INACTIVE: 'CATEGORY_INACTIVE',
  CATEGORY_INVALID_PARENT: 'CATEGORY_INVALID_PARENT',
  PRODUCT_SLUG_ALREADY_EXISTS: 'PRODUCT_SLUG_ALREADY_EXISTS',
  PRODUCT_SLUG_INVALID: 'PRODUCT_SLUG_INVALID',
  PRODUCT_CODE_ALREADY_EXISTS: 'PRODUCT_CODE_ALREADY_EXISTS',
  PRODUCT_VARIANT_COMBINATION_DUPLICATE: 'PRODUCT_VARIANT_COMBINATION_DUPLICATE',
  RENTAL_RATE_DURATION_DUPLICATE: 'RENTAL_RATE_DURATION_DUPLICATE',
  PRODUCT_MULTIPLE_PRIMARY_MEDIA: 'PRODUCT_MULTIPLE_PRIMARY_MEDIA',
  PRODUCT_ACTIVE_RENTAL: 'PRODUCT_ACTIVE_RENTAL',
  SIZE_NOT_IN_SHOP: 'SIZE_NOT_IN_SHOP',
  COLOR_NOT_IN_SHOP: 'COLOR_NOT_IN_SHOP',
  INVENTORY_LOCATION_INVALID: 'INVENTORY_LOCATION_INVALID',
  INVENTORY_SKU_ALREADY_EXISTS: 'INVENTORY_SKU_ALREADY_EXISTS',
  INVENTORY_BARCODE_ALREADY_EXISTS: 'INVENTORY_BARCODE_ALREADY_EXISTS',
  INVENTORY_STATUS_MISMATCH: 'INVENTORY_STATUS_MISMATCH',
  INVENTORY_ACTIVE_ALLOCATION: 'INVENTORY_ACTIVE_ALLOCATION',
  INVENTORY_MANUAL_OCCUPANCY_TRANSITION: 'INVENTORY_MANUAL_OCCUPANCY_TRANSITION',
  INVENTORY_OCCUPIED_TRANSITION: 'INVENTORY_OCCUPIED_TRANSITION',
  INVENTORY_STATUS_NO_OP: 'INVENTORY_STATUS_NO_OP',
  INVENTORY_STATUS_TRANSITION_INVALID: 'INVENTORY_STATUS_TRANSITION_INVALID',
  INVENTORY_STATUS_REASON_REQUIRED: 'INVENTORY_STATUS_REASON_REQUIRED',
} as const;

export type CatalogErrorCode = (typeof CATALOG_ERROR_CODE)[keyof typeof CATALOG_ERROR_CODE];

export class CatalogInvariantError extends Error {
  constructor(
    public readonly code: CatalogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogInvariantError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
export class CatalogCategoryCodeAlreadyExistsError extends CatalogInvariantError {
  constructor() {
    super(CATALOG_ERROR_CODE.CATEGORY_CODE_ALREADY_EXISTS, 'Mã danh mục đã tồn tại.');
  }
}
export class CatalogCategoryError extends CatalogInvariantError {
  constructor(
    code:
      | typeof CATALOG_ERROR_CODE.CATEGORY_NOT_FOUND
      | typeof CATALOG_ERROR_CODE.CATEGORY_INACTIVE,
  ) {
    super(
      code,
      code === 'CATEGORY_INACTIVE' ? 'Danh mục đã ngừng hoạt động.' : 'Không tìm thấy danh mục.',
    );
  }
}
export class CatalogCategoryInvalidParentError extends CatalogInvariantError {
  constructor(message = 'Danh mục không thể chọn chính nó làm danh mục cha.') {
    super(CATALOG_ERROR_CODE.CATEGORY_INVALID_PARENT, message);
  }
}
export class CatalogProductSlugAlreadyExistsError extends CatalogInvariantError {
  constructor() {
    super(CATALOG_ERROR_CODE.PRODUCT_SLUG_ALREADY_EXISTS, 'Slug sản phẩm đã tồn tại trong cửa hàng.');
  }
}

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export interface CatalogRepository {
  listStorefrontCategories(shopId: string): Promise<StorefrontCategory[]>;
  listStorefrontProducts(input: StorefrontProductListCriteria): Promise<StorefrontProductPage>;
  findStorefrontProductBySlug(
    shopId: string,
    slug: string,
  ): Promise<StorefrontProductDetails | null>;
  lookupProducts(
    input: CatalogListProductsCriteria & { productId?: string },
  ): Promise<ProductLookupPage>;
  inventorySummary(shopId: string): Promise<InventorySummary>;
  inventoryHistory(input: InventoryHistoryCriteria): Promise<InventoryHistoryPage>;
  listLookups(shopId: string): Promise<CatalogLookups>;
  listCategories(input: {
    shopId: string;
    page: number;
    limit: number;
    search?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  }): Promise<CategoryPage>;
  categoryOptions(shopId: string, includeInactive?: boolean): Promise<CategoryOption[]>;
  createCategory(
    shopId: string,
    input: {
      parentId?: string | null;
      code: string;
      name: string;
      description?: string;
      status: 'ACTIVE' | 'INACTIVE';
      sortOrder: number;
    },
  ): Promise<CategoryListItem>;
  updateCategory(
    shopId: string,
    id: string,
    input: {
      parentId?: string | null;
      code?: string;
      name?: string;
      description?: string | null;
      status?: 'ACTIVE' | 'INACTIVE';
      sortOrder?: number;
    },
  ): Promise<CategoryListItem | null>;
  deleteCategory(shopId: string, id: string): Promise<'deleted' | 'in-use' | 'not-found'>;
  createSize(
    shopId: string,
    input: { code: string; name: string; sortOrder: number },
  ): Promise<SizeRecord>;
  createColor(
    shopId: string,
    input: { code: string; name: string; hexColor?: string },
  ): Promise<ColorRecord>;
  listProducts(input: CatalogListProductsCriteria): Promise<ProductPage>;
  findProduct(shopId: string, id: string): Promise<ProductDetails>;
  createProduct(shopId: string, input: CreateProductData): Promise<CreateProductResult>;
  addVariant(
    shopId: string,
    productId: string,
    input: CreateProductData['variants'][number],
  ): Promise<AddVariantResult>;
  upsertRentalRate(
    shopId: string,
    variantId: string,
    input: { durationDays: number; price: number },
  ): Promise<UpsertRentalRateResult>;
  updateProduct(shopId: string, id: string, input: UpdateProductData): Promise<UpdateProductResult>;
  archiveProduct(shopId: string, id: string): Promise<boolean>;
  addProductMedia(
    shopId: string,
    productId: string,
    input: ProductMediaData,
  ): Promise<AddProductMediaResult>;
  removeProductMedia(shopId: string, productId: string, mediaId: string): Promise<boolean>;
  addInventoryItem(shopId: string, input: AddInventoryData): Promise<AddInventoryItemResult>;
  updateInventoryStatus(input: CatalogUpdateInventoryStatusData): Promise<AddInventoryItemResult>;
  archiveInventoryItem(
    shopId: string,
    id: string,
    reason?: string,
    changedBy?: string,
  ): Promise<boolean>;
  listInventory(input: CatalogListInventoryCriteria): Promise<InventoryPage>;
  findInventoryItem(shopId: string, id: string): Promise<InventoryDetails>;
  findAvailableInventory(
    input: CatalogFindAvailableInventoryCriteria,
  ): Promise<FindAvailableInventoryResult>;
}

export interface CreateProductData {
  code: string;
  name: string;
  slug?: string;
  categoryId: string;
  description?: string;
  defaultDepositAmount: number;
  replacementValue?: number | null;
  facebookPostUrl?: string | null;
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
  slug?: string;
  categoryId?: string;
  description?: string;
  defaultDepositAmount?: number;
  replacementValue?: number | null;
  facebookPostUrl?: string | null;
  isPublic?: boolean;
  isRentable?: boolean;
  status?: string;
}

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

export interface ProductMediaData {
  url: string;
  altText?: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface CatalogListProductsCriteria {
  shopId: string;
  search?: string;
  categoryId?: string;
  status?: string;
  page: number;
  limit: number;
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

export interface CatalogFindAvailableInventoryCriteria {
  shopId: string;
  variantId: string;
  from: Date;
  until: Date;
}
