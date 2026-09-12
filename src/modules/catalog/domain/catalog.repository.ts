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
  UpdateProductResult,
  UpsertRentalRateResult,
} from './catalog.models';
export class CatalogInvariantError extends Error {}
export class CatalogCategoryCodeAlreadyExistsError extends CatalogInvariantError {
  readonly code = 'CATEGORY_CODE_ALREADY_EXISTS';

  constructor() {
    super('Mã danh mục đã tồn tại.');
  }
}
export class CatalogCategoryError extends CatalogInvariantError {
  constructor(public readonly code: 'CATEGORY_NOT_FOUND' | 'CATEGORY_INACTIVE') {
    super(
      code === 'CATEGORY_INACTIVE' ? 'Danh mục đã ngừng hoạt động.' : 'Không tìm thấy danh mục.',
    );
  }
}

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');

export interface CatalogRepository {
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
