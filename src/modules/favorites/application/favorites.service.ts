import { Inject, Injectable } from '@nestjs/common';
import { paginateMeta } from '@common/types/pagination';
import { ShopResolver } from '@common/tenant/shop-resolver';
import {
  STOREFRONT_CATALOG_REPOSITORY,
  type StorefrontCatalogRepository,
} from '@modules/catalog/domain/storefront-catalog.repository';
import type { StorefrontProductPage } from '@modules/catalog/domain/catalog.models';
import {
  FAVORITE_REPOSITORY,
  type FavoriteMutation,
  type FavoriteRepository,
} from '../domain/favorite.repository';
import { FavoriteProductNotFoundError } from './favorite.errors';

export interface FavoriteMutationResult extends FavoriteMutation {
  productId: string;
  isFavorite: boolean;
}

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

  async summary(accountId: string) {
    return this.repository.summary(accountId, await this.shopResolver.resolveShopId());
  }

  async add(accountId: string, productId: string): Promise<FavoriteMutationResult> {
    const shopId = await this.shopResolver.resolveShopId();
    const products = await this.catalog.listStorefrontProductsByIds(shopId, [productId]);
    if (products.length !== 1) {
      throw new FavoriteProductNotFoundError();
    }
    const result = await this.repository.add(accountId, shopId, productId);
    if (result.kind === 'product_missing') {
      throw new FavoriteProductNotFoundError();
    }
    return { productId, isFavorite: true, total: result.total };
  }

  async remove(accountId: string, productId: string): Promise<FavoriteMutationResult> {
    const result = await this.repository.remove(
      accountId,
      await this.shopResolver.resolveShopId(),
      productId,
    );
    return { productId, isFavorite: false, total: result.total };
  }
}
