import { Inject, Injectable } from '@nestjs/common';
import { ShopResolver } from '@common/tenant/shop-resolver';
import {
  CART_REPOSITORY,
  type CartDraft,
  type CartRepository,
  type CartSnapshot,
} from '../domain/cart.repository';

export const CART_MAX_ITEM_COUNT = 20;
export const CART_MAX_QUANTITY_PER_ITEM = 20;
export const CART_MAX_TOTAL_QUANTITY = 50;

export class CartInputError extends Error {
  constructor(readonly code: 'INVALID_CART_PERIOD' | 'INVALID_CART_SELECTION') {
    super(
      code === 'INVALID_CART_PERIOD'
        ? 'Khoảng ngày thuê trong giỏ không hợp lệ.'
        : 'Lựa chọn trong giỏ không hợp lệ.',
    );
  }
}

export class CartVersionConflictError extends Error {
  constructor() {
    super('Giỏ thuê đã được cập nhật ở nơi khác. Vui lòng đồng bộ lại trước khi tiếp tục.');
  }
}

@Injectable()
export class CartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly repository: CartRepository,
    @Inject(ShopResolver) private readonly shopResolver: Pick<ShopResolver, 'resolveShopId'>,
  ) {}

  async get(accountId: string): Promise<CartSnapshot | null> {
    return this.repository.find(accountId, await this.shopResolver.resolveShopId());
  }

  async replace(
    accountId: string,
    expectedVersion: number,
    draft: CartDraft,
  ): Promise<CartSnapshot> {
    this.assertDraft(draft);
    const result = await this.repository.replace(
      accountId,
      await this.shopResolver.resolveShopId(),
      expectedVersion,
      draft,
    );
    if (result.kind === 'conflict') throw new CartVersionConflictError();
    return result.cart;
  }

  /** Reconciles a guest draft after authentication without trusting cart prices or availability. */
  async mergeGuest(accountId: string, guest: CartDraft): Promise<CartSnapshot> {
    this.assertDraft(guest);
    const shopId = await this.shopResolver.resolveShopId();
    let remote = await this.repository.find(accountId, shopId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const merged = merge(remote, guest);
      const result = await this.repository.replace(accountId, shopId, remote?.version ?? 0, merged);
      if (result.kind === 'updated') return result.cart;
      remote = result.cart;
    }
    throw new CartVersionConflictError();
  }

  private assertDraft(draft: CartDraft): void {
    if (
      !isDate(draft.pickupDate) ||
      !isDate(draft.returnDate) ||
      draft.pickupDate >= draft.returnDate
    )
      throw new CartInputError('INVALID_CART_PERIOD');
    if (!Array.isArray(draft.items) || draft.items.length > CART_MAX_ITEM_COUNT)
      throw new CartInputError('INVALID_CART_SELECTION');

    const identities = new Set<string>();
    let total = 0;
    for (const item of draft.items) {
      if (
        !item ||
        !isUuid(item.productId) ||
        !isUuid(item.variantId) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > CART_MAX_QUANTITY_PER_ITEM
      )
        throw new CartInputError('INVALID_CART_SELECTION');
      const identity = `${item.productId}:${item.variantId}`;
      if (identities.has(identity)) throw new CartInputError('INVALID_CART_SELECTION');
      identities.add(identity);
      total += item.quantity;
      if (total > CART_MAX_TOTAL_QUANTITY) throw new CartInputError('INVALID_CART_SELECTION');
    }
  }
}

function merge(remote: CartSnapshot | null, guest: CartDraft): CartDraft {
  if (!remote || remote.items.length === 0) return guest;
  const items = remote.items.map((item) => ({ ...item }));
  const positions = new Map(
    items.map((item, index) => [`${item.productId}:${item.variantId}`, index]),
  );
  let total = items.reduce((sum, item) => sum + item.quantity, 0);
  for (const guestItem of guest.items) {
    const key = `${guestItem.productId}:${guestItem.variantId}`;
    const existingIndex = positions.get(key);
    if (existingIndex !== undefined) {
      const existing = items[existingIndex]!;
      const room = Math.min(
        CART_MAX_QUANTITY_PER_ITEM - existing.quantity,
        CART_MAX_TOTAL_QUANTITY - total,
      );
      const added = Math.min(room, guestItem.quantity);
      existing.quantity += added;
      total += added;
    } else if (items.length < CART_MAX_ITEM_COUNT && total < CART_MAX_TOTAL_QUANTITY) {
      const quantity = Math.min(guestItem.quantity, CART_MAX_TOTAL_QUANTITY - total);
      items.push({ ...guestItem, quantity });
      positions.set(key, items.length - 1);
      total += quantity;
    }
  }
  return { pickupDate: remote.pickupDate, returnDate: remote.returnDate, items };
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split('-');
  if (yearText === undefined || monthText === undefined || dayText === undefined) return false;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
