import { CATALOG_ERROR_CODE, CatalogInvariantError } from './catalog-errors';

/** Catalog classification; complimentary billing belongs to the rental line. */
export const PRODUCT_KIND = {
  PRODUCT: 'PRODUCT',
  ACCESSORY: 'ACCESSORY',
} as const;

export type ProductKind = (typeof PRODUCT_KIND)[keyof typeof PRODUCT_KIND];

export function isProductKind(value: unknown): value is ProductKind {
  return value === PRODUCT_KIND.PRODUCT || value === PRODUCT_KIND.ACCESSORY;
}

export function requireProductKind(value: unknown): ProductKind {
  if (!isProductKind(value)) {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.PRODUCT_KIND_INVALID,
      'Loại sản phẩm phải là Sản phẩm hoặc Phụ kiện.',
    );
  }
  return value;
}
