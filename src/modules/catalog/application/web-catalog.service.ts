import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/catalog.repository';
import type {
  StorefrontCategory,
  StorefrontProductDetails,
  StorefrontProductPage,
  WebProductListFilterInput,
} from './web-catalog.contracts';

@Injectable()
export class WebCatalogService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repository: CatalogRepository) {}

  async listCategories(shopId: string): Promise<StorefrontCategory[]> {
    return this.repository.listStorefrontCategories(shopId);
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
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }

    return product;
  }
}
