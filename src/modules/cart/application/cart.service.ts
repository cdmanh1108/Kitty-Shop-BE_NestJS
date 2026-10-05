import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '@common/errors/application-error';
import { ShopResolver } from '@common/shop-context/shop-resolver';
import {
  CART_REPOSITORY,
  type CartDraft,
  type CartRepository,
  type CartSnapshot,
} from '../domain/cart.repository';

export const CART_MAX_ITEM_COUNT = 20;
export const CART_MAX_QUANTITY_PER_ITEM = 20;
export const CART_MAX_TOTAL_QUANTITY = 50;

export class CartInputError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;

  constructor(override readonly code: 'INVALID_CART_PERIOD' | 'INVALID_CART_SELECTION') {
    super(
      code === 'INVALID_CART_PERIOD'
        ? 'Khoảng ngày thuê trong giỏ không hợp lệ.'
        : 'Lựa chọn trong giỏ không hợp lệ.',
      code,
      undefined,
      { includeCodeAndMessageInDetails: false },
    );
  }
}

export class CartVersionConflictError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor() {
    super(
      'Giỏ thuê đã được cập nhật ở nơi khác. Vui lòng đồng bộ lại trước khi tiếp tục.',
      'CART_VERSION_CONFLICT',
      undefined,
      { includeCodeAndMessageInDetails: false },
    );
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
