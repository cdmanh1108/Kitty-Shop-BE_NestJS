import type { ColorRecord } from './catalog.records';

export const CATALOG_COLOR_REPOSITORY = Symbol('CATALOG_COLOR_REPOSITORY');

export interface CatalogColorRepository {
  createColor(
    shopId: string,
    input: { code: string; name: string; hexColor: string | null },
  ): Promise<ColorRecord>;
  findColorById(shopId: string, id: string): Promise<ColorRecord | null>;
  findColorByCode(shopId: string, code: string): Promise<ColorRecord | null>;
  isColorInUse(id: string): Promise<boolean>;
  deleteColor(shopId: string, id: string): Promise<boolean>;
}
