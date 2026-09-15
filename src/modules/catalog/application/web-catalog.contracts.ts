import type {
  StorefrontCategory,
  StorefrontProductDetails,
  StorefrontProductItem,
  StorefrontProductPage,
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

export type {
  StorefrontCategory,
  StorefrontProductDetails,
  StorefrontProductItem,
  StorefrontProductPage,
};
