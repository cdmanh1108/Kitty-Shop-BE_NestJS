import type { PaginatedResult } from '@common/types/pagination';
import type {
  CategoryRecord,
  ColorRecord,
  InventoryItemRecord,
  InventoryServiceRecord,
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
  categories: Array<CategoryRecord>;
  sizes: Array<SizeRecord>;
  colors: Array<ColorRecord>;
  locations: Array<ShopLocationRecord>;
};

export type ProductPage = PaginatedResult<
  ProductRecord & {
    category: CategoryRecord;
    variants: Array<
      ProductVariantRecord & {
        _count: {
          inventoryItems: number;
        };
      }
    >;
    media: Array<ProductMediaRecord>;
  }
>;

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

export type InventoryPage = PaginatedResult<
  InventoryItemRecord & {
    variant: ProductVariantRecord & {
      size: null | SizeRecord;
      color: null | ColorRecord;
      product: ProductRecord;
    };
    location: null | ShopLocationRecord;
  }
>;

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
      serviceRecords: Array<InventoryServiceRecord>;
    });

export type FindAvailableInventoryResult = Array<InventoryItemRecord>;
