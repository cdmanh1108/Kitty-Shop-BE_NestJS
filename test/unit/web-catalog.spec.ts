import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import {
  WebCatalogMapper,
  toWebCategory,
  toWebCategoryList,
  toWebProductDetail,
  toWebProductListItem,
  toWebProductListResponse,
} from '../../src/modules/catalog/api/web/web-catalog.mapper';
import { WebCatalogController } from '../../src/modules/catalog/api/web/web-catalog.controller';
import { WebCatalogService } from '../../src/modules/catalog/application/web-catalog.service';
import type { StorefrontCatalogRepository } from '../../src/modules/catalog/domain/storefront-catalog.repository';
import type {
  StorefrontCategory,
  StorefrontProductDetails,
  StorefrontProductItem,
  StorefrontProductPage,
} from '../../src/modules/catalog/domain/catalog.models';
import type { ShopResolver } from '@common/tenant/shop-resolver';

describe('Web Catalog Presenters, Service and Controller', () => {
  describe('WebCatalogMapper.toCategory & toCategoryList', () => {
    it('maps storefront category to clean WebCategoryDto without internal properties', () => {
      const entity: StorefrontCategory = {
        id: 'cat-1',
        name: 'Đầm dạ hội',
        code: 'EVENING_DRESS',
        slug: 'dam-da-hoi',
        parentId: null,
        description: 'Váy đầm cao cấp cho tiệc tối',
        sortOrder: 1,
      };

      const result = WebCatalogMapper.toCategory(entity);
      expect(result).toEqual({
        id: 'cat-1',
        name: 'Đầm dạ hội',
        code: 'EVENING_DRESS',
        slug: 'dam-da-hoi',
        parentId: null,
        sortOrder: 1,
        description: 'Váy đầm cao cấp cho tiệc tối',
      });
      // Ensure internal properties are not exposed
      expect(result).not.toHaveProperty('shopId');
      expect(result).not.toHaveProperty('archivedAt');
      expect(result).not.toHaveProperty('isActive');
      expect(toWebCategory(entity)).toEqual(result);
    });

    it('maps an array of categories via toCategoryList and alias toWebCategoryList', () => {
      const entities: StorefrontCategory[] = [
        {
          id: 'cat-1',
          name: 'Váy',
          code: 'VAY',
          slug: 'vay',
          parentId: null,
          sortOrder: 0,
        },
      ];

      const res1 = WebCatalogMapper.toCategoryList(entities);
      const res2 = toWebCategoryList(entities);
      expect(res1).toHaveLength(1);
      expect(res1[0]?.id).toBe('cat-1');
      expect(res2).toEqual(res1);
    });
  });

  describe('WebCatalogMapper.toProductListItem & toProductListResponse', () => {
    it('maps storefront product item to clean WebProductListItemDto', () => {
      const product: StorefrontProductItem = {
        id: 'prod-1',
        code: 'DR001',
        name: 'Đầm dạ hội lụa ánh kim',
        slug: 'dam-da-hoi-lua-anh-kim',
        categoryId: 'cat-1',
        categoryName: 'Đầm tiệc',
        imageUrl: 'https://img.com/main.jpg',
        size: 'S, M',
        color: 'Trắng',
        rentalPrices: [{ days: 3, amount: 400000 }],
        depositAmount: 500000,
        isRentable: true,
      };

      const result = WebCatalogMapper.toProductListItem(product);

      expect(result.id).toBe('prod-1');
      expect(result.code).toBe('DR001');
      expect(result.name).toBe('Đầm dạ hội lụa ánh kim');
      expect(result.slug).toBe('dam-da-hoi-lua-anh-kim');
      expect(result.imageUrl).toBe('https://img.com/main.jpg');
      expect(result.categoryName).toBe('Đầm tiệc');
      expect(result.rentalPrices).toEqual([{ days: 3, amount: 400000 }]);
      expect(result.depositAmount).toBe(500000);
      expect(result.isRentable).toBe(true);
      expect(result.size).toBe('S, M');
      expect(result.color).toBe('Trắng');

      // Optimized/stripped fields must not exist in list DTO
      expect(result).not.toHaveProperty('gallery');
      expect(result).not.toHaveProperty('status');
      expect(result).not.toHaveProperty('purchasePrice');
      expect(result).not.toHaveProperty('replacementValue');
      expect(result).not.toHaveProperty('featured');
      expect(result).not.toHaveProperty('tags');
      expect(result).not.toHaveProperty('shopId');
      expect(toWebProductListItem(product)).toEqual(result);
    });

    it('maps paginated product page via toProductListResponse and alias toWebProductListResponse', () => {
      const page: StorefrontProductPage = {
        items: [
          {
            id: 'p-1',
            code: 'SP-1',
            slug: 'vay-ngan',
            name: 'Váy ngắn',
            categoryId: 'cat-1',
            categoryName: 'Váy',
            imageUrl: 'https://img.com/1.jpg',
            size: 'Free size',
            color: 'Hồng',
            rentalPrices: [{ days: 1, amount: 50000 }],
            depositAmount: 100000,
            isRentable: true,
          },
        ],
        meta: {
          page: 2,
          limit: 10,
          total: 25,
          totalPages: 3,
        },
      };

      const res = WebCatalogMapper.toProductListResponse(page);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).not.toHaveProperty('gallery');
      expect(res.items[0]).not.toHaveProperty('status');
      expect(res.meta).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
      expect(toWebProductListResponse(page)).toEqual(res);
    });
  });

  describe('WebCatalogMapper.toProductDetail', () => {
    it('maps full product details including variants, pricing rates, and images', () => {
      const product: StorefrontProductDetails = {
        id: 'prod-1',
        code: 'DR001',
        name: 'Đầm dạ hội lụa ánh kim',
        slug: 'dam-da-hoi-lua-anh-kim',
        categoryId: 'cat-1',
        categoryName: 'Đầm tiệc',
        imageUrl: 'https://img.com/1.jpg',
        gallery: ['https://img.com/1.jpg', 'https://img.com/2.jpg'],
        size: 'S',
        color: 'Đỏ',
        rentalPrices: [
          { days: 1, amount: 150000 },
          { days: 3, amount: 350000 },
        ],
        depositAmount: 500000,
        isRentable: true,
        description: 'Váy dạ hội sang trọng.',
        facebookPostUrl: 'https://facebook.com/post/1',
        variants: [
          {
            id: 'var-1',
            code: 'DR001-S',
            size: 'S',
            color: 'Đỏ',
            depositAmount: 500000,
          },
        ],
      };

      const result = WebCatalogMapper.toProductDetail(product);

      expect(result.id).toBe('prod-1');
      expect(result.gallery).toEqual(['https://img.com/1.jpg', 'https://img.com/2.jpg']);
      expect(result.imageUrl).toBe('https://img.com/1.jpg');
      expect(result.rentalPrices.length).toBe(2);
      expect(result.description).toBe('Váy dạ hội sang trọng.');
      expect(result.facebookPostUrl).toBe('https://facebook.com/post/1');
      expect(result.variants.length).toBe(1);
      expect(result.variants[0]?.code).toBe('DR001-S');
      expect(result.variants[0]?.size).toBe('S');
      expect(result.variants[0]?.color).toBe('Đỏ');
      expect(result.variants[0]?.depositAmount).toBe(500000);

      // Verify no physical inventory items or internal fields leaked
      expect(result).not.toHaveProperty('status');
      expect(result.variants[0]).not.toHaveProperty('inventoryItems');
      expect(result.variants[0]).not.toHaveProperty('physicalStockIds');
      expect(result.variants[0]).not.toHaveProperty('archivedAt');
      expect(result).not.toHaveProperty('shopId');

      // Verify backwards compatible function alias
      expect(toWebProductDetail(product)).toEqual(result);
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
      service = new WebCatalogService(mockRepo as unknown as StorefrontCatalogRepository);
    });

    it('returns categories from repository', async () => {
      mockRepo.listStorefrontCategories.mockResolvedValueOnce([
        {
          id: 'cat-1',
          code: 'VAY',
          name: 'Váy',
          slug: 'vay',
          parentId: null,
          sortOrder: 0,
        },
      ]);

      const res = await service.listCategories('shop-1');
      expect(res).toHaveLength(1);
      expect(res[0]?.id).toBe('cat-1');
      expect(mockRepo.listStorefrontCategories).toHaveBeenCalledWith('shop-1');
    });

    it('returns paginated response with items and metadata, clamping pagination limits', async () => {
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
            size: 'S, M',
            color: 'Đỏ',
            rentalPrices: [{ days: 3, amount: 250000 }],
            depositAmount: 500000,
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

    it('finds product by canonical slug', async () => {
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

  describe('WebCatalogController', () => {
    let controller: WebCatalogController;
    let mockShopResolver: { resolveShopId: jest.Mock };
    let mockService: {
      listCategories: jest.Mock;
      listProducts: jest.Mock;
      getProduct: jest.Mock;
    };
    const mockRequest = {} as Request;

    beforeEach(() => {
      mockShopResolver = {
        resolveShopId: jest.fn().mockResolvedValue('shop-uuid-1'),
      };
      mockService = {
        listCategories: jest.fn().mockResolvedValue([
          {
            id: 'cat-1',
            code: 'AO_DAI',
            name: 'Áo dài',
            slug: 'ao-dai',
            parentId: null,
            sortOrder: 1,
            description: 'Áo dài truyền thống',
          },
        ]),
        listProducts: jest.fn().mockResolvedValue({
          items: [
            {
              id: 'p-1',
              code: 'AD01',
              slug: 'ao-dai-do',
              name: 'Áo dài đỏ',
              categoryId: 'cat-1',
              categoryName: 'Áo dài',
              imageUrl: 'https://img.com/ad.jpg',
              size: 'M',
              color: 'Đỏ',
              rentalPrices: [{ days: 3, amount: 200000 }],
              depositAmount: 300000,
              isRentable: true,
            },
          ],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
        getProduct: jest.fn().mockResolvedValue({
          id: 'p-1',
          code: 'AD01',
          slug: 'ao-dai-do',
          name: 'Áo dài đỏ',
          categoryId: 'cat-1',
          categoryName: 'Áo dài',
          imageUrl: 'https://img.com/ad.jpg',
          gallery: ['https://img.com/ad.jpg'],
          size: 'M',
          color: 'Đỏ',
          rentalPrices: [{ days: 3, amount: 200000 }],
          depositAmount: 300000,
          isRentable: true,
          description: 'Mô tả chi tiết',
          facebookPostUrl: null,
          variants: [
            {
              id: 'v-1',
              code: 'AD01-M',
              size: 'M',
              color: 'Đỏ',
              depositAmount: 300000,
            },
          ],
        }),
      };

      controller = new WebCatalogController(
        mockShopResolver as unknown as ShopResolver,
        mockService as unknown as WebCatalogService,
      );
    });

    it('delegates listCategories to shopResolver and WebCatalogMapper', async () => {
      const res = await controller.listCategories(mockRequest);
      expect(mockShopResolver.resolveShopId).toHaveBeenCalledWith(mockRequest);
      expect(mockService.listCategories).toHaveBeenCalledWith('shop-uuid-1');
      expect(res).toHaveLength(1);
      expect(res[0]?.code).toBe('AO_DAI');
    });

    it('delegates listProducts to shopResolver and WebCatalogMapper', async () => {
      const query = { page: 1, limit: 20, q: 'ao dai' };
      const res = await controller.listProducts(mockRequest, query);
      expect(mockShopResolver.resolveShopId).toHaveBeenCalledWith(mockRequest);
      expect(mockService.listProducts).toHaveBeenCalledWith('shop-uuid-1', query);
      expect(res.items).toHaveLength(1);
      expect(res.meta.total).toBe(1);
    });

    it('delegates getProduct to shopResolver and WebCatalogMapper', async () => {
      const res = await controller.getProduct(mockRequest, 'ao-dai-do');
      expect(mockShopResolver.resolveShopId).toHaveBeenCalledWith(mockRequest);
      expect(mockService.getProduct).toHaveBeenCalledWith('shop-uuid-1', 'ao-dai-do');
      expect(res.slug).toBe('ao-dai-do');
      expect(res.variants).toHaveLength(1);
    });
  });
});
