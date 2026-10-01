import type { CatalogLookups } from './catalog.models';

export const CATALOG_REFERENCE_DATA_REPOSITORY = Symbol('CATALOG_REFERENCE_DATA_REPOSITORY');

/** Read-only lookups used to populate catalog forms. */
export interface CatalogReferenceDataRepository {
  listLookups(shopId: string): Promise<CatalogLookups>;
}
