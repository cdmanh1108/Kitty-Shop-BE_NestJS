import type {
  StorefrontCategory,
  StorefrontProductDetails,
  StorefrontProductListCriteria,
  StorefrontProductPage,
} from './catalog.models';

export const STOREFRONT_CATALOG_REPOSITORY = Symbol('STOREFRONT_CATALOG_REPOSITORY');

/** Public read model; it deliberately exposes no admin or inventory operations. */
export interface StorefrontCatalogRepository {
  listStorefrontCategories(shopId: string): Promise<StorefrontCategory[]>;
  listStorefrontProducts(input: StorefrontProductListCriteria): Promise<StorefrontProductPage>;
  findStorefrontProductBySlug(shopId: string, slug: string): Promise<StorefrontProductDetails | null>;
}
