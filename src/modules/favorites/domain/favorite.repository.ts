export const FAVORITE_REPOSITORY = Symbol('FAVORITE_REPOSITORY');

export interface FavoritePage {
  productIds: string[];
  total: number;
}

export interface FavoriteStatus {
  productIds: string[];
  total: number;
}

export interface FavoriteSummary {
  total: number;
}

export interface FavoriteMutation {
  total: number;
}

export type FavoriteAddResult = { kind: 'stored'; total: number } | { kind: 'product_missing' };

export interface FavoriteRepository {
  listProductIds(
    accountId: string,
    shopId: string,
    page: number,
    limit: number,
  ): Promise<FavoritePage>;
  summary(accountId: string, shopId: string): Promise<FavoriteSummary>;
  status(accountId: string, shopId: string, productIds: string[]): Promise<FavoriteStatus>;
  add(accountId: string, shopId: string, productId: string): Promise<FavoriteAddResult>;
  remove(accountId: string, shopId: string, productId: string): Promise<FavoriteMutation>;
}
