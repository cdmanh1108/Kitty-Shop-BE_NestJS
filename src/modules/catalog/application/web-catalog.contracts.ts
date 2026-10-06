import type {
  StorefrontCategory,
  StorefrontCatalogFilters,
  StorefrontProductDetails,
  StorefrontProductItem,
  StorefrontProductPage,
  StorefrontSelectionInput,
  StorefrontSelectionResolution,
} from '../domain/catalog.models';

import type { ProductKind } from '../domain/product-kind';

export interface WebProductListFilterInput {
  kind?: ProductKind;
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  size?: string;
  color?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc';
}

export interface WebCatalogFiltersInput {
  kind?: ProductKind;
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
