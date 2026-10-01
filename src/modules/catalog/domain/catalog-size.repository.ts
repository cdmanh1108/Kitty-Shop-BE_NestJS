import type { SizeRecord } from './catalog.records';
import type { SizePage } from './catalog.models';

export const CATALOG_SIZE_REPOSITORY = Symbol('CATALOG_SIZE_REPOSITORY');

export interface SizeListCriteria {
  shopId: string;
  page: number;
  limit: number;
  q?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
}

export interface CatalogSizeRepository {
  listSizes(input: SizeListCriteria): Promise<SizePage>;
  createSize(
    shopId: string,
    input: { code: string; name: string; sortOrder: number },
  ): Promise<SizeRecord>;
  findSizeById(shopId: string, id: string): Promise<SizeRecord | null>;
  findSizeByCode(shopId: string, code: string): Promise<SizeRecord | null>;
  updateSize(
    shopId: string,
    id: string,
    input: { code?: string; name?: string; sortOrder?: number },
  ): Promise<SizeRecord | null>;
  updateSizeStatus(
    shopId: string,
    id: string,
    isActive: boolean,
  ): Promise<{ size: SizeRecord; changed: boolean } | null>;
  isSizeInUse(id: string): Promise<boolean>;
  deleteSize(shopId: string, id: string): Promise<boolean>;
}
