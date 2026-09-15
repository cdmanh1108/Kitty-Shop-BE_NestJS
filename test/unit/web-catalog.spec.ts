import {
  toWebCategory,
  toWebProductDetail,
  toWebProductListItem,
  type RawProduct,
} from '../../src/modules/catalog/api/web/web-catalog.mapper';

describe('Web Catalog Presenters and DTO Mapping', () => {
  describe('toWebCategory', () => {
    it('maps category entity to clean WebCategoryDto without internal properties', () => {
      const entity = {
        id: 'cat-1',
        name: 'Đầm dạ hội',
        code: 'EVENING_DRESS',
        description: 'Váy đầm cao cấp cho tiệc tối',
        sortOrder: 1,
        shopId: 'shop-uuid-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      };

      const result = toWebCategory(entity);
      expect(result).toEqual({
        id: 'cat-1',
        name: 'Đầm dạ hội',
        code: 'EVENING_DRESS',
        slug: 'dam-da-hoi',
        description: 'Váy đầm cao cấp cho tiệc tối',
      });
      // Ensure internal properties are not exposed
      expect(result).not.toHaveProperty('shopId');
      expect(result).not.toHaveProperty('archivedAt');
    });
  });

  describe('toWebProductListItem', () => {
    it('maps product with primary media, pricing, and sizes to storefront card format', () => {
      const product: RawProduct = {
        id: 'prod-1',
        code: 'DR001',
        name: 'Đầm dạ hội lụa ánh kim',
        slug: 'dam-da-hoi-lua-anh-kim',
        categoryId: 'cat-1',
        description: 'Chất liệu lụa cao cấp.',
        defaultDepositAmount: 500000,
        status: 'ACTIVE',
        isRentable: true,
        facebookPostUrl: 'https://facebook.com/post/1',
        category: { id: 'cat-1', name: 'Đầm tiệc' },
        media: [
          { url: 'https://img.com/main.jpg', isPrimary: true },
          { url: 'https://img.com/sub.jpg', isPrimary: false },
        ],
        variants: [
          {
            id: 'var-1',
            variantCode: 'DR001-S',
            size: { name: 'S' },
            color: { name: 'Trắng' },
            rentalRates: [{ durationDays: 3, price: 350000 }],
          },
          {
            id: 'var-2',
            variantCode: 'DR001-M',
            size: { name: 'M' },
            color: { name: 'Trắng' },
            rentalRates: [],
          },
        ],
        rentalRates: [{ durationDays: 3, price: 400000 }],
      };

      const result = toWebProductListItem(product);

      expect(result.id).toBe('prod-1');
      expect(result.code).toBe('DR001');
      expect(result.name).toBe('Đầm dạ hội lụa ánh kim');
      expect(result.slug).toBe('dam-da-hoi-lua-anh-kim');
      expect(result.imageUrl).toBe('https://img.com/main.jpg');
      expect(result.categoryName).toBe('Đầm tiệc');
      expect(result.rentalPrices).toEqual([{ days: 3, amount: 400000 }]);
      expect(result.depositAmount).toBe(500000);
      expect(result.isRentable).toBe(true);
      expect(result.size).toContain('S');
      expect(result.size).toContain('M');

      // Internal fields must not exist
      expect(result).not.toHaveProperty('purchasePrice');
      expect(result).not.toHaveProperty('replacementValue');
    });

    it('generates slug from product name if slug is null', () => {
      const product: RawProduct = {
        id: 'prod-2',
        code: 'DR002',
        name: 'Váy ngắn',
        slug: null,
        categoryId: 'cat-1',
        status: 'ACTIVE',
        defaultDepositAmount: 0,
        isRentable: true,
        category: { id: 'cat-1', name: 'Đầm' },
        media: [],
        variants: [],
        rentalRates: [],
      };

      const result = toWebProductListItem(product);
      expect(result.slug).toBe('vay-ngan');
    });
  });

  describe('toWebProductDetail', () => {
    it('maps full product details including variants, pricing rates, and images', () => {
      const product: RawProduct = {
        id: 'prod-1',
        code: 'DR001',
        name: 'Đầm dạ hội lụa ánh kim',
        slug: 'dam-da-hoi-lua-anh-kim',
        categoryId: 'cat-1',
        status: 'ACTIVE',
        description: 'Váy dạ hội sang trọng.',
        defaultDepositAmount: 500000,
        facebookPostUrl: 'https://facebook.com/post/1',
        category: { id: 'cat-1', name: 'Đầm tiệc' },
        media: [
          { url: 'https://img.com/1.jpg', isPrimary: true },
          { url: 'https://img.com/2.jpg', isPrimary: false },
        ],
        variants: [
          {
            id: 'var-1',
            variantCode: 'DR001-S',
            depositAmountOverride: null,
            size: { name: 'S' },
            color: { name: 'Đỏ' },
            rentalRates: [{ durationDays: 3, price: 350000 }],
          },
        ],
        rentalRates: [
          { durationDays: 1, price: 150000 },
          { durationDays: 3, price: 350000 },
        ],
      };

      const result = toWebProductDetail(product);

      expect(result.id).toBe('prod-1');
      expect(result.gallery).toEqual(['https://img.com/1.jpg', 'https://img.com/2.jpg']);
      expect(result.imageUrl).toBe('https://img.com/1.jpg');
      expect(result.rentalPrices.length).toBe(2);
      expect(result.variants.length).toBe(1);
      expect(result.variants[0]?.code).toBe('DR001-S');

      // Verify no physical inventory items leaked
      expect(result.variants[0]).not.toHaveProperty('inventoryItems');
      expect(result.variants[0]).not.toHaveProperty('physicalStockIds');
    });
  });
});
