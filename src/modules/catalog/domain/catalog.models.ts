import type { ProductListItem } from './catalog.read-models';
import type { PaginatedResult } from '@common/types/pagination';
import type { DecimalValue } from '@common/types/decimal';
import type {
  CategoryRecord,
  ColorRecord,
  InventoryItemRecord,
  InventoryStatusHistoryRecord,
  ProductMediaRecord,
  ProductRecord,
  ProductVariantRecord,
  RentalRateRecord,
  SizeRecord,
} from '@modules/catalog/domain/catalog.records';

export type CatalogLocationOption = Pick<ShopLocationDetails, 'id' | 'code' | 'name' | 'isPrimary'>;

/** Snapshot shape returned with Catalog inventory; it is intentionally read-only. */
export interface ShopLocationDetails {
  id: string;
  shopId: string;
  code: string;
  name: string;
  phone: string | null;
  addressLine: string | null;
  ward: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  country: string;
  latitude: DecimalValue | null;
  longitude: DecimalValue | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Rental allocation fields included in Catalog's inventory detail response. */
export interface InventoryAllocationDetails {
  id: string;
  shopId: string;
  orderId: string;
  orderItemId: string;
  inventoryItemId: string;
  reservedFrom: Date;
  reservedUntil: Date;
  status: string;
  allocatedAt: Date;
  releasedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CatalogLookups = {
  categories: Array<
    Pick<CategoryRecord, 'id' | 'parentId' | 'code' | 'name' | 'description'> & {
      productCount: number;
    }
  >;
  sizes: Array<Pick<SizeRecord, 'id' | 'code' | 'name' | 'sortOrder' | 'isActive'>>;
  colors: Array<Pick<ColorRecord, 'id' | 'code' | 'name' | 'hexColor' | 'isActive'>>;
  locations: CatalogLocationOption[];
};

export type CategoryListItem = Pick<
  CategoryRecord,
  'id' | 'parentId' | 'code' | 'name' | 'description' | 'sortOrder'
> & {
  status: 'ACTIVE' | 'INACTIVE';
  productCount: number;
  parent?: { id: string; code: string; name: string } | null;
};
export type CategoryPage = PaginatedResult<CategoryListItem>;
export type ColorManagementItem = Pick<
  ColorRecord,
  'id' | 'code' | 'name' | 'hexColor' | 'isActive' | 'createdAt' | 'updatedAt'
>;
export type ColorPage = PaginatedResult<ColorManagementItem>;
export type SizeManagementItem = Pick<
  SizeRecord,
  'id' | 'code' | 'name' | 'sortOrder' | 'isActive' | 'createdAt' | 'updatedAt'
>;
export type SizePage = PaginatedResult<SizeManagementItem>;
export type CategoryOption = Pick<CategoryRecord, 'id' | 'parentId' | 'code' | 'name'> & {
  status: 'ACTIVE' | 'INACTIVE';
};

export type ProductPage = PaginatedResult<ProductListItem>;

export type ProductVariantDetails = Pick<
  ProductVariantRecord,
  'id' | 'variantCode' | 'sizeId' | 'colorId' | 'depositAmountOverride' | 'status' | 'archivedAt'
> & {
  size: null | Pick<SizeRecord, 'id' | 'code' | 'name' | 'sortOrder' | 'isActive'>;
  color: null | Pick<ColorRecord, 'id' | 'code' | 'name' | 'hexColor' | 'isActive'>;
  _count: { inventoryItems: number };
  rentalRates: Array<
    Pick<RentalRateRecord, 'id' | 'durationDays' | 'price' | 'currency' | 'isActive'>
  >;
};

export type ProductDetails =
  | null
  | (Pick<
      ProductRecord,
      | 'id'
      | 'code'
      | 'name'
      | 'categoryId'
      | 'description'
      | 'defaultDepositAmount'
      | 'replacementValue'
      | 'facebookPostUrl'
      | 'status'
      | 'isRentable'
      | 'isPublic'
      | 'createdAt'
      | 'updatedAt'
    > & {
      category: Pick<CategoryRecord, 'id' | 'code' | 'name'> & {
        status: 'ACTIVE' | 'INACTIVE';
      };
      variants: ProductVariantDetails[];
      media: Array<Pick<ProductMediaRecord, 'id' | 'url' | 'altText' | 'isPrimary' | 'sortOrder'>>;
      rentalRates: Array<
        Pick<RentalRateRecord, 'id' | 'durationDays' | 'price' | 'currency' | 'isActive'>
      >;
    });

export type CreateProductResult = ProductRecord & {
  variants: Array<
    ProductVariantRecord & {
      inventoryItems: Array<InventoryItemRecord>;
      rentalRates: Array<RentalRateRecord>;
    }
  >;
  media: Array<ProductMediaRecord>;
};

export type AddVariantResult =
  | null
  | (ProductVariantRecord & {
      size: null | SizeRecord;
      color: null | ColorRecord;
      inventoryItems: Array<InventoryItemRecord>;
      rentalRates: Array<RentalRateRecord>;
    });

export interface ProductVariantMutationResult {
  before: ProductVariantRecord;
  variant: ProductVariantRecord;
  details: ProductVariantDetails;
  changed: boolean;
}

export type DeleteProductVariantResult =
  | { kind: 'NOT_FOUND' }
  | { kind: 'IN_USE'; variant: ProductVariantRecord }
  | { kind: 'DELETED'; variant: ProductVariantRecord };

export type UpsertRentalRateResult = null | RentalRateRecord;

export type UpdateProductResult = null | ProductRecord;

export type AddProductMediaResult = null | ProductMediaRecord;

export type SetPrimaryProductMediaResult = null | ProductMediaRecord;

export interface ProductMediaUploadTarget {
  shopCode: string;
  productCode: string;
}

export interface RemovedProductMedia {
  storageKey: string | null;
}

export type AddInventoryItemResult = null | InventoryItemRecord;

export type InventoryOccupancyStatus = 'FREE' | 'RESERVED' | 'RENTED';

export type InventoryCurrentRentalSummary = {
  orderId: string;
  orderNumber: string;
  status: string;
  reservedFrom: Date;
  reservedUntil: Date;
};

export type InventoryPageItem = Pick<
  InventoryItemRecord,
  'id' | 'variantId' | 'sku' | 'currentStatus' | 'condition' | 'updatedAt'
> & {
  variant: Pick<ProductVariantRecord, 'id' | 'variantCode' | 'sizeId' | 'colorId'> & {
    size: null | Pick<SizeRecord, 'id' | 'code' | 'name' | 'sortOrder'>;
    color: null | Pick<ColorRecord, 'id' | 'code' | 'name' | 'hexColor'>;
    product: Pick<ProductRecord, 'id' | 'code' | 'name' | 'categoryId'>;
  };
  occupancyStatus: InventoryOccupancyStatus;
  allowedManualTransitions: Array<string>;
  currentRental: null | InventoryCurrentRentalSummary;
};

export type InventoryPage = PaginatedResult<InventoryPageItem>;

export type InventoryDetails =
  | null
  | (InventoryItemRecord & {
      variant: ProductVariantRecord & {
        size: null | SizeRecord;
        color: null | ColorRecord;
        product: ProductRecord;
        rentalRates: Array<RentalRateRecord>;
      };
      location: null | ShopLocationDetails;
      occupancyStatus: InventoryOccupancyStatus;
      allowedManualTransitions: Array<string>;
      currentRental: null | InventoryCurrentRentalSummary;
      allocations: Array<
        InventoryAllocationDetails & {
          order: {
            id: string;
            status: string;
            customer: {
              phone: string;
              fullName: string;
            };
            orderNumber: string;
          };
        }
      >;
      statusHistory: Array<InventoryStatusHistoryRecord>;
    });

export interface StorefrontCategory {
  id: string;
  code: string;
  name: string;
  slug: string | null;
  parentId: string | null;
  sortOrder: number;
  description?: string | null;
}

export interface StorefrontSizeOption {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
}

export interface StorefrontColorOption {
  id: string;
  code: string;
  name: string;
  hexColor: string | null;
}

export interface StorefrontCatalogFilters {
  sizes: StorefrontSizeOption[];
  colors: StorefrontColorOption[];
}

export interface StorefrontCatalogFiltersCriteria {
  shopId: string;
  category?: string;
}

export interface StorefrontRentalPrice {
  days: number;
  amount: number;
}

export interface StorefrontProductVariant {
  id: string;
  code: string;
  size?: string | null;
  color?: string | null;
  depositAmount?: number;
}

export interface StorefrontProductItem {
  id: string;
  code: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName: string;
  imageUrl: string;
  size: string;
  color: string;
  rentalPrices: StorefrontRentalPrice[];
  depositAmount: number;
  isRentable: boolean;
}

export interface StorefrontProductDetails {
  id: string;
  code: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName: string;
  imageUrl: string;
  gallery: string[];
  size: string;
  color: string;
  rentalPrices: StorefrontRentalPrice[];
  depositAmount: number;
  isRentable: boolean;
  description?: string | null;
  facebookPostUrl?: string | null;
  variants: StorefrontProductVariant[];
}

export type StorefrontProductPage = PaginatedResult<StorefrontProductItem>;

export interface StorefrontProductListCriteria {
  shopId: string;
  page: number;
  limit: number;
  q?: string;
  category?: string;
  size?: string;
  color?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';
}

/**
 * A selected cart identity. `productId` remains an explicitly documented
 * compatibility alias; a variant is selected only when the C09 rules can
 * prove that the product has exactly one eligible variant.
 */
export interface StorefrontSelectionInput {
  productId?: string;
  variantId?: string;
  quantity: number;
}

export interface StorefrontSelectedProduct {
  id: string;
  slug: string;
  name: string;
}

export interface StorefrontSelectedVariant {
  id: string;
  code: string;
  size: string | null;
  color: string | null;
}

export type StorefrontSelectionResolution =
  | {
      status: 'RESOLVED';
      index: number;
      quantity: number;
      product: StorefrontSelectedProduct;
      variant: StorefrontSelectedVariant;
      imageUrl: string | null;
    }
  | {
      status: 'SELECTION_REQUIRED';
      index: number;
      quantity: number;
      product: StorefrontSelectedProduct;
      imageUrl: string | null;
    }
  | {
      status: 'UNAVAILABLE';
      index: number;
      quantity: number;
    };
