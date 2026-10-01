import type { ColorRecord } from './catalog.records';

export const CATALOG_COLOR_REPOSITORY = Symbol('CATALOG_COLOR_REPOSITORY');

export interface CatalogColorRepository {
  createColor(
    shopId: string,
    input: { code: string; name: string; hexColor?: string },
  ): Promise<ColorRecord>;
}
