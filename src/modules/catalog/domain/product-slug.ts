import { slugify } from '@common/utils/slugify';
import { CatalogInvariantError } from './catalog.repository';

/** Canonical persisted public identity for a product. */
export function normalizeProductSlug(value: string): string {
  const slug = slugify(value.trim());
  if (!slug) throw new CatalogInvariantError('Slug sản phẩm không hợp lệ.');
  return slug;
}

export function generateProductSlug(name: string, code: string): string {
  try {
    return normalizeProductSlug(name);
  } catch {
    return normalizeProductSlug(`product-${code}`);
  }
}
