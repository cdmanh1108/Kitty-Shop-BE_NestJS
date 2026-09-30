import type { CategoryListItem, CategoryOption, CategoryPage } from './catalog.models';

export const CATALOG_CATEGORY_REPOSITORY = Symbol('CATALOG_CATEGORY_REPOSITORY');

/** Category lifecycle and category-specific read models. */
export interface CatalogCategoryRepository {
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
}
