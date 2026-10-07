import type { StorefrontProductPage } from '../../src/modules/catalog/domain/catalog.models';
import { FavoritesMapper } from '../../src/modules/favorites/api/favorites.mapper';

describe('FavoritesMapper', () => {
  it('maps the storefront product view to Favorites-owned list response fields', () => {
    const page = {
      items: [
        {
          id: 'product-1',
          allowFreeAccessory: false,
          code: 'SP-001',
          slug: 'dam-da-hoi-trang',
          name: 'Đầm dạ hội trắng lụa cao cấp',
          categoryId: 'category-1',
          categoryName: 'Váy thiết kế',
          imageUrl: 'https://images.example/product-1.jpg',
          size: 'S',
          color: 'Trắng',
          rentalPrices: [
            { days: 3, amount: 150000 },
            { days: 7, amount: 300000 },
          ],
          depositAmount: 500000,
          isRentable: true,
        },
      ],
      meta: { page: 2, limit: 1, total: 8, totalPages: 8 },
    } satisfies StorefrontProductPage;

    expect(FavoritesMapper.toProductListResponse(page)).toEqual({
      items: [
        {
          id: 'product-1',
          allowFreeAccessory: false,
          code: 'SP-001',
          slug: 'dam-da-hoi-trang',
          name: 'Đầm dạ hội trắng lụa cao cấp',
          categoryId: 'category-1',
          categoryName: 'Váy thiết kế',
          imageUrl: 'https://images.example/product-1.jpg',
          size: 'S',
          color: 'Trắng',
          rentalPrices: [
            { days: 3, amount: 150000 },
            { days: 7, amount: 300000 },
          ],
          depositAmount: 500000,
          isRentable: true,
        },
      ],
      meta: { page: 2, limit: 1, total: 8, totalPages: 8 },
    });
  });
});
