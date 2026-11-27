export const STOREFRONT_CACHE_INVALIDATOR = Symbol('STOREFRONT_CACHE_INVALIDATOR');

export type StorefrontCacheScope = 'products' | 'categories';

export interface StorefrontCacheInvalidator {
  /** Best-effort notification after a committed write. Resolves when disabled or unavailable. */
  invalidate(scope: StorefrontCacheScope): Promise<void>;
}

export const noStorefrontCacheInvalidation: StorefrontCacheInvalidator = {
  invalidate: () => Promise.resolve(),
};
