import type { ColorRecord } from './catalog.records';
import type { ColorPage } from './catalog.models';

export const CATALOG_COLOR_REPOSITORY = Symbol('CATALOG_COLOR_REPOSITORY');

export interface ColorListCriteria {
  shopId: string;
  page: number;
  limit: number;
  q?: string;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
}

export interface CatalogColorRepository {
  listColors(input: ColorListCriteria): Promise<ColorPage>;
  createColor(
    shopId: string,
    input: { code: string; name: string; hexColor: string | null },
  ): Promise<ColorRecord>;
  findColorById(shopId: string, id: string): Promise<ColorRecord | null>;
  findColorByCode(shopId: string, code: string): Promise<ColorRecord | null>;
  updateColor(
    shopId: string,
    id: string,
    input: { code?: string; name?: string; hexColor?: string | null },
  ): Promise<ColorRecord | null>;
  updateColorStatus(
    shopId: string,
    id: string,
    isActive: boolean,
  ): Promise<{ color: ColorRecord; changed: boolean } | null>;
  isColorInUse(id: string): Promise<boolean>;
  deleteColor(shopId: string, id: string): Promise<boolean>;
}
