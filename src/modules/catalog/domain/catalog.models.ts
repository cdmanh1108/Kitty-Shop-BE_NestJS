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
    Pick<CategoryRecord, 'id' | 'code' | 'name' | 'description'> & { productCount: number }
  >;
  sizes: Array<Pick<SizeRecord, 'id' | 'code' | 'name' | 'sortOrder'>>;
  colors: Array<Pick<ColorRecord, 'id' | 'code' | 'name' | 'hexColor'>>;
  locations: Array<Pick<ShopLocationRecord, 'id' | 'code' | 'name' | 'isPrimary'>>;
};

export type CategoryListItem = Pick<
  CategoryRecord,
  'id' | 'code' | 'name' | 'description' | 'sortOrder' | 'createdAt' | 'updatedAt'
> & { status: 'ACTIVE' | 'INACTIVE'; productCount: number };
export type CategoryPage = PaginatedResult<CategoryListItem>;
export type CategoryOption = Pick<CategoryRecord, 'id' | 'code' | 'name'>;

export type ProductPage = PaginatedResult<ProductListItem>;

export type ProductDetails =
  | null
  | (ProductRecord & {
      category: CategoryRecord;
      variants: Array<
        ProductVariantRecord & {
          size: null | SizeRecord;
          color: null | ColorRecord;
          inventoryItems: Array<InventoryItemRecord>;
          rentalRates: Array<RentalRateRecord>;
        }
      >;
      media: Array<ProductMediaRecord>;
      rentalRates: Array<RentalRateRecord>;
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
