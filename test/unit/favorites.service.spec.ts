import { NotFoundException } from '@nestjs/common';
import { FavoritesService } from '../../src/modules/favorites/application/favorites.service';
import type { FavoriteRepository } from '../../src/modules/favorites/domain/favorite.repository';
import type { StorefrontCatalogRepository } from '../../src/modules/catalog/domain/storefront-catalog.repository';
import type { StorefrontProductItem } from '../../src/modules/catalog/domain/catalog.models';

const product: StorefrontProductItem = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'DRESS-001',
  slug: 'dress-001',
  name: 'Dress',
  categoryId: '00000000-0000-4000-8000-000000000002',
  categoryName: 'Dress',
  imageUrl: '',
  size: 'M',
  color: 'White',
  rentalPrices: [],
  depositAmount: 0,
  isRentable: true,
};

function repository(overrides: Partial<FavoriteRepository> = {}): FavoriteRepository {
  return {
    listProductIds: jest.fn().mockResolvedValue({ productIds: [], total: 0 }),
    status: jest.fn().mockResolvedValue({ productIds: [], total: 0 }),
    add: jest.fn().mockResolvedValue('stored'),
    remove: jest.fn(),
    ...overrides,
  };
}

function catalog(
  overrides: Partial<StorefrontCatalogRepository> = {},
): StorefrontCatalogRepository {
  return {
    listStorefrontCategories: jest.fn(),
    listStorefrontProducts: jest.fn(),
    listStorefrontProductsByIds: jest.fn(),
    findStorefrontProductBySlug: jest.fn(),
    resolveStorefrontSelections: jest.fn(),
    ...overrides,
  };
}

describe('FavoritesService', () => {
  it('hydrates only the account-owned favorite IDs through storefront visibility', async () => {
    const listProductIds = jest.fn().mockResolvedValue({ productIds: [product.id], total: 1 });
    const listStorefrontProductsByIds = jest.fn().mockResolvedValue([product]);
    const repo = repository({
      listProductIds,
    });
    const storefront = catalog({
      listStorefrontProductsByIds,
    });
    const service = new FavoritesService(repo, storefront, {
      resolveShopId: jest.fn().mockResolvedValue('shop-id'),
    });

    await expect(service.list('account-id', 1, 20)).resolves.toEqual({
      items: [product],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(listProductIds).toHaveBeenCalledWith('account-id', 'shop-id', 1, 20);
    expect(listStorefrontProductsByIds).toHaveBeenCalledWith('shop-id', [product.id]);
  });

  it('rejects a product that is not storefront-visible before persisting it', async () => {
    const add = jest.fn().mockResolvedValue('stored');
    const repo = repository({ add });
    const storefront = catalog({ listStorefrontProductsByIds: jest.fn().mockResolvedValue([]) });
    const service = new FavoritesService(repo, storefront, {
      resolveShopId: jest.fn().mockResolvedValue('shop-id'),
    });

    await expect(service.add('account-id', product.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(add).not.toHaveBeenCalled();
  });

  it('keeps add idempotent and allows an idempotent account-scoped remove', async () => {
    const add = jest.fn().mockResolvedValue('stored');
    const remove = jest.fn();
    const repo = repository({ add, remove });
    const storefront = catalog({
      listStorefrontProductsByIds: jest.fn().mockResolvedValue([product]),
    });
    const service = new FavoritesService(repo, storefront, {
      resolveShopId: jest.fn().mockResolvedValue('shop-id'),
    });

    await service.add('account-id', product.id);
    await service.remove('account-id', product.id);
    expect(add).toHaveBeenCalledWith('account-id', product.id);
    expect(remove).toHaveBeenCalledWith('account-id', product.id);
  });

  it('returns a bounded product status and visible count without loading every favorite', async () => {
    const status = jest.fn().mockResolvedValue({ productIds: [product.id], total: 7 });
    const repo = repository({
      status,
    });
    const service = new FavoritesService(repo, catalog(), {
      resolveShopId: jest.fn().mockResolvedValue('shop-id'),
    });

    await expect(service.status('account-id', [product.id])).resolves.toEqual({
      productIds: [product.id],
      total: 7,
    });
    expect(status).toHaveBeenCalledWith('account-id', 'shop-id', [product.id]);
  });
});
