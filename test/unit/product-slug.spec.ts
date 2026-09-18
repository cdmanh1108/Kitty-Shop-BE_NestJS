import { CatalogInvariantError } from '../../src/modules/catalog/domain/catalog.repository';
import {
  generateProductSlug,
  normalizeProductSlug,
} from '../../src/modules/catalog/domain/product-slug';

describe('product slug identity', () => {
  it('generates the canonical persisted slug from a product name', () => {
    expect(generateProductSlug('Áo Dài Đỏ', 'AO-DAI-001')).toBe('ao-dai-do');
  });

  it('uses a stable code-derived fallback when a name cannot form a slug', () => {
    expect(generateProductSlug('!!!', 'AO-DAI-001')).toBe('product-ao-dai-001');
  });

  it('rejects an explicit blank slug instead of persisting an empty public identity', () => {
    expect(() => normalizeProductSlug(' --- ')).toThrow(CatalogInvariantError);
  });
});
