import { Inject, Injectable } from '@nestjs/common';
import {
  STOREFRONT_CATALOG_REPOSITORY,
  type StorefrontCatalogRepository,
} from '../domain/storefront-catalog.repository';
import type {
  StorefrontCategory,
  StorefrontCatalogFilters,
  StorefrontProductDetails,
  StorefrontProductPage,
  StorefrontSelectionInput,
  StorefrontSelectionResolution,
  WebProductListFilterInput,
  WebCatalogFiltersInput,
} from './web-catalog.contracts';
import { CatalogResourceNotFoundError } from './catalog-application.errors';

@Injectable()
export class WebCatalogService {
  constructor(
    @Inject(STOREFRONT_CATALOG_REPOSITORY)
    private readonly repository: StorefrontCatalogRepository,
  ) {}

  async listCategories(shopId: string): Promise<StorefrontCategory[]> {
    return this.repository.listStorefrontCategories(shopId);
  }

  async listFilters(
    shopId: string,
    query: WebCatalogFiltersInput,
  ): Promise<StorefrontCatalogFilters> {
    return this.repository.listStorefrontFilters({ shopId, category: query.category });
  }

  async listProducts(
    shopId: string,
    query: WebProductListFilterInput,
  ): Promise<StorefrontProductPage> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    return this.repository.listStorefrontProducts({
      shopId,
      page,
      limit,
      q: query.q,
      category: query.category,
      size: query.size,
      color: query.color,
      sort: query.sort,
    });
  }

  async getProduct(shopId: string, slug: string): Promise<StorefrontProductDetails> {
    const product = await this.repository.findStorefrontProductBySlug(shopId, slug);
    if (!product) {
      throw new CatalogResourceNotFoundError('Không tìm thấy sản phẩm.');
    }

    return product;
  }

  async resolveSelections(
    shopId: string,
    selections: StorefrontSelectionInput[],
  ): Promise<StorefrontSelectionResolution[]> {
    return this.repository.resolveStorefrontSelections({ shopId, selections });
  }
}
