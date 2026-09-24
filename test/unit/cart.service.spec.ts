import {
  CartService,
  CartVersionConflictError,
} from '../../src/modules/cart/application/cart.service';
import type { CartRepository } from '../../src/modules/cart/domain/cart.repository';

const productId = '00000000-0000-4000-8000-000000000001';
const variantId = '00000000-0000-4000-8000-000000000002';
const nextProductId = '00000000-0000-4000-8000-000000000003';
const nextVariantId = '00000000-0000-4000-8000-000000000004';
const draft = {
  pickupDate: '2026-10-01',
  returnDate: '2026-10-03',
  items: [{ productId, variantId, quantity: 1 }],
};

function repository(overrides: Partial<CartRepository> = {}): CartRepository {
  return {
    find: jest.fn(),
    replace: jest.fn(),
    ...overrides,
  };
}

function service(repo: CartRepository): CartService {
  return new CartService(repo, { resolveShopId: jest.fn().mockResolvedValue('shop-id') });
}

describe('CartService', () => {
  it('creates a versioned account cart with a previously absent server cart', async () => {
    const replace = jest
      .fn()
      .mockResolvedValue({ kind: 'updated', cart: { version: 1, ...draft } });
    const repo = repository({
      replace,
    });
    await expect(service(repo).replace('account-id', 0, draft)).resolves.toEqual({
      version: 1,
      ...draft,
    });
    expect(replace).toHaveBeenCalledWith('account-id', 'shop-id', 0, draft);
  });

  it('rejects malformed periods, duplicate selections and unsupported quantities before persistence', async () => {
    const replace = jest.fn();
    const repo = repository({ replace });
    await expect(
      service(repo).replace('account-id', 0, { ...draft, pickupDate: '2026-02-30' }),
    ).rejects.toMatchObject({ code: 'INVALID_CART_PERIOD' });
    await expect(
      service(repo).replace('account-id', 0, { ...draft, items: [...draft.items, ...draft.items] }),
    ).rejects.toMatchObject({ code: 'INVALID_CART_SELECTION' });
    expect(replace).not.toHaveBeenCalled();
  });

  it('merges a guest cart with the server cart without treating prices or availability as cart data', async () => {
    const remote = { version: 3, ...draft };
    const merged = {
      version: 4,
      pickupDate: remote.pickupDate,
      returnDate: remote.returnDate,
      items: [
        { productId, variantId, quantity: 3 },
        { productId: nextProductId, variantId: nextVariantId, quantity: 2 },
      ],
    };
    const replace = jest.fn().mockResolvedValue({ kind: 'updated', cart: merged });
    const repo = repository({
      find: jest.fn().mockResolvedValue(remote),
      replace,
    });
    await expect(
      service(repo).mergeGuest('account-id', {
        ...draft,
        pickupDate: '2026-11-01',
        returnDate: '2026-11-03',
        items: [
          { productId, variantId, quantity: 2 },
          { productId: nextProductId, variantId: nextVariantId, quantity: 2 },
        ],
      }),
    ).resolves.toEqual(merged);
    expect(replace).toHaveBeenCalledWith('account-id', 'shop-id', 3, {
      pickupDate: remote.pickupDate,
      returnDate: remote.returnDate,
      items: merged.items,
    });
  });

  it('fails rather than silently overwriting a concurrent cart update', async () => {
    const repo = repository({
      replace: jest.fn().mockResolvedValue({ kind: 'conflict', cart: null }),
    });
    await expect(service(repo).replace('account-id', 2, draft)).rejects.toBeInstanceOf(
      CartVersionConflictError,
    );
  });
});
