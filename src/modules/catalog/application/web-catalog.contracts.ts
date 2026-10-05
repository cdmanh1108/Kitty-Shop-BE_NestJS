import type {
  StorefrontCategory,
  StorefrontCatalogFilters,
  StorefrontProductDetails,
  StorefrontProductItem,
  StorefrontProductPage,
  StorefrontSelectionInput,
  StorefrontSelectionResolution,
} from '../domain/catalog.models';

export interface WebProductListFilterInput {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  size?: string;
  color?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';
}

export interface WebCatalogFiltersInput {
  category?: string;
}

export type {
  StorefrontCategory,
  StorefrontCatalogFilters,
  StorefrontProductDetails,
  StorefrontProductItem,
  StorefrontProductPage,
  StorefrontSelectionInput,
  StorefrontSelectionResolution,
};
