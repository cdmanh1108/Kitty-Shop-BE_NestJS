export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export interface CartSelection {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface CartSnapshot {
  version: number;
  pickupDate: string;
  returnDate: string;
  items: CartSelection[];
}

export interface CartDraft {
  pickupDate: string;
  returnDate: string;
  items: CartSelection[];
}

export type CartReplaceResult =
  | { kind: 'updated'; cart: CartSnapshot }
  | { kind: 'conflict'; cart: CartSnapshot | null };

export interface CartRepository {
  find(accountId: string, shopId: string): Promise<CartSnapshot | null>;
  replace(
    accountId: string,
    shopId: string,
    expectedVersion: number,
    draft: CartDraft,
  ): Promise<CartReplaceResult>;
}
