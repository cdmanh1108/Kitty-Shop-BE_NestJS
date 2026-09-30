import type { CatalogLookups } from './catalog.models';
import type { ColorRecord, SizeRecord } from './catalog.records';

export const CATALOG_REFERENCE_DATA_REPOSITORY = Symbol('CATALOG_REFERENCE_DATA_REPOSITORY');

/** Read and write operations for catalog form reference data. */
export interface CatalogReferenceDataRepository {
  listLookups(shopId: string): Promise<CatalogLookups>;
  createSize(
    shopId: string,
    input: { code: string; name: string; sortOrder: number },
  ): Promise<SizeRecord>;
  createColor(
    shopId: string,
    input: { code: string; name: string; hexColor?: string },
  ): Promise<ColorRecord>;
}
