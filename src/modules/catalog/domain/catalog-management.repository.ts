import type { ColorRecord, SizeRecord } from './catalog.records';
import type {
  CatalogLookups,
  CategoryListItem,
  CategoryOption,
  CategoryPage,
} from './catalog.models';

export const CATALOG_MANAGEMENT_REPOSITORY = Symbol('CATALOG_MANAGEMENT_REPOSITORY');

/** Categories and reference data used by catalog management forms. */
export interface CatalogManagementRepository {
  listLookups(shopId: string): Promise<CatalogLookups>;
  listCategories(input: {
    shopId: string;
    page: number;
    limit: number;
    search?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  }): Promise<CategoryPage>;
  categoryOptions(shopId: string, includeInactive?: boolean): Promise<CategoryOption[]>;
  createCategory(
    shopId: string,
    input: {
      parentId?: string | null;
      code: string;
      name: string;
      description?: string;
      status: 'ACTIVE' | 'INACTIVE';
      sortOrder: number;
    },
  ): Promise<CategoryListItem>;
  updateCategory(
    shopId: string,
    id: string,
    input: {
      parentId?: string | null;
      code?: string;
      name?: string;
      description?: string | null;
      status?: 'ACTIVE' | 'INACTIVE';
      sortOrder?: number;
    },
  ): Promise<CategoryListItem | null>;
  deleteCategory(shopId: string, id: string): Promise<'deleted' | 'in-use' | 'not-found'>;
  createSize(
    shopId: string,
    input: { code: string; name: string; sortOrder: number },
  ): Promise<SizeRecord>;
  createColor(
    shopId: string,
    input: { code: string; name: string; hexColor?: string },
  ): Promise<ColorRecord>;
}
