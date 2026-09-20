import type { ProductListItem } from './catalog.read-models';
import type { PaginatedResult } from '@common/types/pagination';
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
import type { RentalItemAllocationRecord } from '@modules/rentals/domain/rentals.records';
import type { ShopLocationRecord } from '@modules/settings/domain/settings.records';

export type CatalogLookups = {
  categories: Array<
    Pick<CategoryRecord, 'id' | 'parentId' | 'code' | 'name' | 'description'> & {
      productCount: number;
    }
  >;
  sizes: Array<Pick<SizeRecord, 'id' | 'code' | 'name' | 'sortOrder'>>;
  colors: Array<Pick<ColorRecord, 'id' | 'code' | 'name' | 'hexColor'>>;
  locations: Array<Pick<ShopLocationRecord, 'id' | 'code' | 'name' | 'isPrimary'>>;
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
export type CategoryOption = Pick<CategoryRecord, 'id' | 'parentId' | 'code' | 'name'> & {
  status: 'ACTIVE' | 'INACTIVE';
};

export type ProductPage = PaginatedResult<ProductListItem>;

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
      variants: Array<
        Pick<
          ProductVariantRecord,
          'id' | 'variantCode' | 'sizeId' | 'colorId' | 'depositAmountOverride' | 'status'
        > & {
          size: null | Pick<SizeRecord, 'name'>;
          color: null | Pick<ColorRecord, 'name' | 'hexColor'>;
          _count: { inventoryItems: number };
          rentalRates: Array<
            Pick<RentalRateRecord, 'id' | 'durationDays' | 'price' | 'currency' | 'isActive'>
          >;
        }
      >;
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

export type UpsertRentalRateResult = null | RentalRateRecord;

export type UpdateProductResult = null | ProductRecord;

export type AddProductMediaResult = null | ProductMediaRecord;

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
      location: null | ShopLocationRecord;
      occupancyStatus: InventoryOccupancyStatus;
      allowedManualTransitions: Array<string>;
      currentRental: null | InventoryCurrentRentalSummary;
      allocations: Array<
        RentalItemAllocationRecord & {
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

export type FindAvailableInventoryResult = Array<InventoryItemRecord>;

export interface StorefrontCategory {
  id: string;
  code: string;
  name: string;
  slug: string | null;
  parentId: string | null;
  sortOrder: number;
  description?: string | null;
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
