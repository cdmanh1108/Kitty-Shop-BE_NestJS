import type {
  StorefrontCategory,
  StorefrontCatalogFilters,
  StorefrontCatalogFiltersCriteria,
  StorefrontProductDetails,
  StorefrontProductItem,
  StorefrontProductListCriteria,
  StorefrontProductPage,
  StorefrontSelectionInput,
  StorefrontSelectionResolution,
} from './catalog.models';

export const STOREFRONT_CATALOG_REPOSITORY = Symbol('STOREFRONT_CATALOG_REPOSITORY');

/** Public read model; it deliberately exposes no admin or inventory operations. */
export interface StorefrontCatalogRepository {
  listStorefrontCategories(shopId: string): Promise<StorefrontCategory[]>;
  listStorefrontFilters(input: StorefrontCatalogFiltersCriteria): Promise<StorefrontCatalogFilters>;
  listStorefrontProducts(input: StorefrontProductListCriteria): Promise<StorefrontProductPage>;
  listStorefrontProductsByIds(
    shopId: string,
    productIds: string[],
  ): Promise<StorefrontProductItem[]>;
  findStorefrontProductBySlug(
    shopId: string,
    slug: string,
  ): Promise<StorefrontProductDetails | null>;
  resolveStorefrontSelections(input: {
    shopId: string;
    selections: StorefrontSelectionInput[];
  }): Promise<StorefrontSelectionResolution[]>;
}
