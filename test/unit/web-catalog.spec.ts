import { NotFoundException } from '@nestjs/common';
import {
  toWebCategory,
  toWebProductDetail,
  toWebProductListItem,
  type RawProduct,
} from '../../src/modules/catalog/api/web/web-catalog.mapper';
import { WebCatalogService } from '../../src/modules/catalog/application/web-catalog.service';
import type { CatalogRepository } from '../../src/modules/catalog/domain/catalog.repository';

describe('Web Catalog Presenters and Service', () => {
  describe('toWebCategory', () => {
    it('maps category entity to clean WebCategoryDto without internal properties', () => {
      const entity = {
        id: 'cat-1',
        name: 'Đầm dạ hội',
        code: 'EVENING_DRESS',
        slug: 'dam-da-hoi',
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
      expect(result).not.toHaveProperty('featured');
      expect(result).not.toHaveProperty('tags');
    });

    it('uses canonical slug', () => {
      const product: RawProduct = {
        id: 'prod-2',
        code: 'DR002',
        name: 'Váy ngắn',
        slug: 'vay-ngan-xoe',
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
      expect(result.slug).toBe('vay-ngan-xoe');
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

  describe('WebCatalogService', () => {
    let mockRepo: {
      listStorefrontCategories: jest.Mock;
      listStorefrontProducts: jest.Mock;
      findStorefrontProductBySlug: jest.Mock;
    };
    let service: WebCatalogService;

    beforeEach(() => {
      mockRepo = {
        listStorefrontCategories: jest.fn(),
        listStorefrontProducts: jest.fn(),
        findStorefrontProductBySlug: jest.fn(),
      };
      service = new WebCatalogService(mockRepo as unknown as CatalogRepository);
    });

    it('returns paginated response with items and metadata', async () => {
      mockRepo.listStorefrontProducts.mockResolvedValue({
        items: [
          {
            id: 'p-1',
            code: 'SP-1',
            slug: 'dam-da-hoi',
            name: 'Đầm dạ hội',
            categoryId: 'cat-1',
            categoryName: 'Đầm',
            imageUrl: 'https://img.com/1.jpg',
            gallery: ['https://img.com/1.jpg'],
            size: 'S, M',
            color: 'Đỏ',
            rentalPrices: [{ days: 3, amount: 250000 }],
            depositAmount: 500000,
            status: 'active',
            isRentable: true,
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });

      const res = await service.listProducts('shop-1', {
        page: 1,
        limit: 20,
        size: 'S',
        color: 'Đỏ',
        sort: 'price_asc',
      });

      expect(res.items.length).toBe(1);
      expect(res.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(mockRepo.listStorefrontProducts).toHaveBeenCalledWith({
        shopId: 'shop-1',
        page: 1,
        limit: 20,
        q: undefined,
        category: undefined,
        size: 'S',
        color: 'Đỏ',
        sort: 'price_asc',
      });
    });

    it('finds product by canonical slug without table scan', async () => {
      mockRepo.findStorefrontProductBySlug.mockResolvedValue({
        id: 'p-1',
        code: 'SP-1',
        slug: 'dam-da-hoi',
        name: 'Đầm dạ hội',
        categoryId: 'cat-1',
        categoryName: 'Đầm',
        imageUrl: 'https://img.com/1.jpg',
        gallery: ['https://img.com/1.jpg'],
        size: 'S',
        color: 'Đỏ',
        rentalPrices: [{ days: 3, amount: 250000 }],
        depositAmount: 500000,
        status: 'active',
        isRentable: true,
        variants: [
          {
            id: 'v-1',
            code: 'SP-1-S',
            size: 'S',
            color: 'Đỏ',
            depositAmount: 500000,
          },
        ],
      });

      const product = await service.getProduct('shop-1', 'dam-da-hoi');
      expect(product.slug).toBe('dam-da-hoi');
      expect(product.name).toBe('Đầm dạ hội');
      expect(mockRepo.findStorefrontProductBySlug).toHaveBeenCalledWith('shop-1', 'dam-da-hoi');
    });

    it('throws NotFoundException when slug is not found', async () => {
      mockRepo.findStorefrontProductBySlug.mockResolvedValue(null);

      await expect(service.getProduct('shop-1', 'non-existing-slug')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
