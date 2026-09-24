export const FAVORITE_REPOSITORY = Symbol('FAVORITE_REPOSITORY');

export interface FavoritePage {
  productIds: string[];
  total: number;
}

export interface FavoriteStatus {
  productIds: string[];
  total: number;
}

export type FavoriteAddResult = 'stored' | 'product_missing';

export interface FavoriteRepository {
  listProductIds(
    accountId: string,
    shopId: string,
    page: number,
    limit: number,
  ): Promise<FavoritePage>;
  status(accountId: string, shopId: string, productIds: string[]): Promise<FavoriteStatus>;
  add(accountId: string, productId: string): Promise<FavoriteAddResult>;
  remove(accountId: string, productId: string): Promise<void>;
}
