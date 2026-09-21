import type {
  StorefrontCategory,
  StorefrontProductDetails,
  StorefrontProductListCriteria,
  StorefrontProductPage,
  StorefrontSelectionInput,
  StorefrontSelectionResolution,
} from './catalog.models';

export const STOREFRONT_CATALOG_REPOSITORY = Symbol('STOREFRONT_CATALOG_REPOSITORY');

/** Public read model; it deliberately exposes no admin or inventory operations. */
export interface StorefrontCatalogRepository {
  listStorefrontCategories(shopId: string): Promise<StorefrontCategory[]>;
  listStorefrontProducts(input: StorefrontProductListCriteria): Promise<StorefrontProductPage>;
  findStorefrontProductBySlug(
    shopId: string,
    slug: string,
  ): Promise<StorefrontProductDetails | null>;
  resolveStorefrontSelections(input: {
    shopId: string;
    selections: StorefrontSelectionInput[];
  }): Promise<StorefrontSelectionResolution[]>;
}
