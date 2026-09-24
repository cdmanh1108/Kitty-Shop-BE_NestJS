import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { paginateMeta } from '@common/types/pagination';
import { ShopResolver } from '@common/tenant/shop-resolver';
import {
  STOREFRONT_CATALOG_REPOSITORY,
  type StorefrontCatalogRepository,
} from '@modules/catalog/domain/storefront-catalog.repository';
import type { StorefrontProductPage } from '@modules/catalog/domain/catalog.models';
import { FAVORITE_REPOSITORY, type FavoriteRepository } from '../domain/favorite.repository';

@Injectable()
export class FavoritesService {
  constructor(
    @Inject(FAVORITE_REPOSITORY) private readonly repository: FavoriteRepository,
    @Inject(STOREFRONT_CATALOG_REPOSITORY)
    private readonly catalog: StorefrontCatalogRepository,
    @Inject(ShopResolver) private readonly shopResolver: Pick<ShopResolver, 'resolveShopId'>,
  ) {}

  async list(accountId: string, page: number, limit: number): Promise<StorefrontProductPage> {
    const shopId = await this.shopResolver.resolveShopId();
    const favorites = await this.repository.listProductIds(accountId, shopId, page, limit);
    const items = await this.catalog.listStorefrontProductsByIds(shopId, favorites.productIds);
    return { items, meta: paginateMeta(page, limit, favorites.total) };
  }

  async status(accountId: string, productIds: string[]) {
    return this.repository.status(accountId, await this.shopResolver.resolveShopId(), productIds);
  }

  async add(accountId: string, productId: string): Promise<void> {
    const shopId = await this.shopResolver.resolveShopId();
    const products = await this.catalog.listStorefrontProductsByIds(shopId, [productId]);
    if (
      products.length !== 1 ||
      (await this.repository.add(accountId, productId)) === 'product_missing'
    ) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
  }

  remove(accountId: string, productId: string): Promise<void> {
    return this.repository.remove(accountId, productId);
  }
}
