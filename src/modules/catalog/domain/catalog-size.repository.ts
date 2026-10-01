import type { SizeRecord } from './catalog.records';

export const CATALOG_SIZE_REPOSITORY = Symbol('CATALOG_SIZE_REPOSITORY');

export interface CatalogSizeRepository {
  createSize(
    shopId: string,
    input: { code: string; name: string; sortOrder: number },
  ): Promise<SizeRecord>;
  findSizeById(shopId: string, id: string): Promise<SizeRecord | null>;
  findSizeByCode(shopId: string, code: string): Promise<SizeRecord | null>;
  isSizeInUse(id: string): Promise<boolean>;
  deleteSize(shopId: string, id: string): Promise<boolean>;
}
