import type { InventoryStatus } from '@modules/catalog/domain/catalog-status';
import type { PaginationParams } from '@common/types/pagination';
import type {
  CreateProductData,
  ProductMediaData,
  UpdateProductData,
  UpdateProductVariantData,
} from '../domain/catalog-product.inputs';
export interface AddInventoryInput {
  variantId: string;
  locationId?: string;
  sku?: string;
  barcode?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  notes?: string;
}

export type AddVariantInput = CreateProductData['variants'][number];

export interface RentalRateInput {
  durationDays: number;
  price: number;
}

export interface AvailabilityQuery {
  variantId: string;
  from: string;
  until: string;
}

export interface CreateCategoryInput {
  parentId?: string | null;
  code?: string;
  name: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  sortOrder?: number;
}

export interface CategoryListQuery extends PaginationParams {
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateCategoryInput {
  parentId?: string | null;
  code?: string;
  name?: string;
  description?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  sortOrder?: number;
}

export interface CreateColorInput {
  code: string;
  name: string;
  hexColor?: string;
}

export interface ColorListQuery extends PaginationParams {
  q?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
}

export interface UpdateColorInput {
  code?: string;
  name?: string;
  hexColor?: string | null;
}

export type CreateProductInput = CreateProductData;

export type ProductVariantInput = CreateProductData['variants'][number];

export type UpdateProductVariantInput = UpdateProductVariantData;

export type ProductMediaInput = ProductMediaData;

export interface ProductMediaUploadInput {
  file?: {
    buffer: Buffer;
    mimetype: string;
  };
  altText?: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface CreateSizeInput {
  code: string;
  name: string;
  sortOrder?: number;
}

export interface SizeListQuery extends PaginationParams {
  q?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
}

export interface UpdateSizeInput {
  code?: string;
  name?: string;
  sortOrder?: number;
}

export interface InventoryListQuery extends PaginationParams {
  variantId?: string;
  productId?: string;
  categoryId?: string;
  status?: string;
  search?: string;
}

export interface ProductListQuery extends PaginationParams {
  allowFreeAccessory?: boolean;
  search?: string;
  categoryId?: string;
  status?: string;
}

export interface UpdateInventoryStatusInput {
  status: InventoryStatus;
  expectedFromStatus?: InventoryStatus;
  condition?: string;
  reason?: string;
  notes?: string;
}

export type UpdateProductInput = UpdateProductData;

export type UpsertRentalRateInput = RentalRateInput;
