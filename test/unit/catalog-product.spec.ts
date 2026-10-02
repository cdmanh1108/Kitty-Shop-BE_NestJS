import { Prisma } from '@prisma/client';
import type { AuditPort } from '@modules/audit/domain/audit.port';
import type { CurrentUser } from '@common/types/current-user';
import type { ObjectStoragePort } from '@common/storage/object-storage.port';
import type {
  CreateProductResult,
  UpdateProductResult,
} from '../../src/modules/catalog/domain/catalog.models';
import {
  CATALOG_ERROR_CODE,
  CatalogCategoryError,
  CatalogInvariantError,
  CatalogProductSlugAlreadyExistsError,
} from '../../src/modules/catalog/domain/catalog-errors';
import type { CatalogProductRepository } from '../../src/modules/catalog/domain/catalog-product.repository';
import { ProductService } from '../../src/modules/catalog/application/product.service';
import {
  CatalogResourceNotFoundError,
  DuplicateProductVariantCombinationError,
  InvalidCatalogInputError,
} from '../../src/modules/catalog/application/catalog-application.errors';

describe('ProductService', () => {
  let repository: CatalogProductRepository;
  let audit: AuditPort;
  let storage: ObjectStoragePort;
  let service: ProductService;

  let createProductMock: jest.MockedFunction<CatalogProductRepository['createProduct']>;
  let updateProductMock: jest.MockedFunction<CatalogProductRepository['updateProduct']>;
  let archiveProductMock: jest.MockedFunction<CatalogProductRepository['archiveProduct']>;
  let auditLogMock: jest.MockedFunction<AuditPort['log']>;

  const mockUser: CurrentUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    memberId: '22222222-2222-2222-2222-222222222222',
    shopId: '33333333-3333-3333-3333-333333333333',
    email: 'admin@kitty.vn',
    fullName: 'Admin',
    permissions: ['catalog.view', 'catalog.manage'],
  };

  beforeEach(() => {
    createProductMock = jest.fn();
    updateProductMock = jest.fn();
    archiveProductMock = jest.fn();
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    repository = {
      lookupProducts: jest.fn(),
      listProducts: jest.fn(),
      findProduct: jest.fn(),
      createProduct: createProductMock,
      addVariant: jest.fn(),
      upsertRentalRate: jest.fn(),
      updateProduct: updateProductMock,
      archiveProduct: archiveProductMock,
      addProductMedia: jest.fn(),
      setPrimaryProductMedia: jest.fn(),
      findProductMediaUploadTarget: jest.fn(),
      countProductMediaByStorageKey: jest.fn(),
      removeProductMedia: jest.fn(),
    };
    audit = {
      log: auditLogMock,
    };
    storage = {
      getObject: jest.fn(),
      putObject: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn(),
      getPublicUrl: jest.fn(),
    };
    service = new ProductService(repository, audit, storage);
  });

  describe('createProduct', () => {
    it.each([
      ['CATEGORY_NOT_FOUND', CatalogInvariantError],
      ['CATEGORY_INACTIVE', CatalogInvariantError],
    ] as const)('maps %s to a semantic HTTP error', async (code, exceptionType) => {
      createProductMock.mockRejectedValue(new CatalogCategoryError(code));
      const promise = service.createProduct(mockUser, {
        code: 'DRESS-ERR',
        name: 'Dress',
        categoryId: 'category',
        defaultDepositAmount: 0,
        isPublic: true,
        variants: [],
        media: [],
      });
      await expect(promise).rejects.toBeInstanceOf(exceptionType);
      await expect(promise).rejects.toMatchObject({ code });
    });

    it('creates product with multiple variants (M/Trắng and M/Hồng) atomically', async () => {
      const createdProduct: CreateProductResult = {
        id: 'prod-1',
        shopId: mockUser.shopId,
        categoryId: 'cat-1',
        code: 'DRESS-01',
        name: 'Váy Công Chúa',
        slug: 'vay-cong-chua',
        description: 'Mô tả',
        defaultDepositAmount: new Prisma.Decimal(200000),
        replacementValue: new Prisma.Decimal(1500000),
        facebookPostUrl: 'https://www.facebook.com/share/p/123456/',
        currency: 'VND',
        status: 'ACTIVE',
        isRentable: true,
        isPublic: true,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        variants: [],
        media: [],
      };
      createProductMock.mockResolvedValue(createdProduct);

      const result = await service.createProduct(mockUser, {
        code: 'DRESS-01',
        name: 'Váy Công Chúa',
        categoryId: 'cat-1',
        defaultDepositAmount: 200000,
        replacementValue: 1500000,
        facebookPostUrl: 'https://www.facebook.com/share/p/123456/',
        isPublic: true,
        variants: [
          {
            variantCode: 'DRESS-01-M-WHITE',
            sizeId: 'size-m',
            colorId: 'color-white',
            inventoryCount: 2,
            rentalRates: [{ durationDays: 1, price: 50000 }],
          },
          {
            variantCode: 'DRESS-01-M-PINK',
            sizeId: 'size-m',
            colorId: 'color-pink',
            inventoryCount: 1,
            rentalRates: [{ durationDays: 1, price: 50000 }],
          },
        ],
        media: [{ url: 'https://example.com/img.jpg', isPrimary: true, sortOrder: 0 }],
      });

      expect(result).toBe(createdProduct);
      expect(createProductMock).toHaveBeenCalledWith(
        mockUser.shopId,
        expect.objectContaining({
          code: 'DRESS-01',
          name: 'Váy Công Chúa',
          replacementValue: 1500000,
          facebookPostUrl: 'https://www.facebook.com/share/p/123456/',
        }),
      );
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'product' }),
      );
    });

    it('rejects duplicate variant combinations (same size and color)', async () => {
      await expect(
        service.createProduct(mockUser, {
          code: 'DRESS-02',
          name: 'Váy Xòe',
          categoryId: 'cat-1',
          defaultDepositAmount: 0,
          isPublic: true,
          variants: [
            {
              variantCode: 'DRESS-02-M-WHITE-1',
              sizeId: 'size-m',
              colorId: 'color-white',
              inventoryCount: 1,
              rentalRates: [{ durationDays: 1, price: 50000 }],
            },
            {
              variantCode: 'DRESS-02-M-WHITE-2',
              sizeId: 'size-m',
              colorId: 'color-white',
              inventoryCount: 1,
              rentalRates: [{ durationDays: 1, price: 50000 }],
            },
          ],
          media: [],
        }),
      ).rejects.toThrow(DuplicateProductVariantCombinationError);
    });

    it('rejects duplicate variant codes in request', async () => {
      await expect(
        service.createProduct(mockUser, {
          code: 'DRESS-03',
          name: 'Váy Hoa',
          categoryId: 'cat-1',
          defaultDepositAmount: 0,
          isPublic: true,
          variants: [
            {
              variantCode: 'DUP-CODE',
              sizeId: 'size-s',
              inventoryCount: 1,
              rentalRates: [{ durationDays: 1, price: 50000 }],
            },
            {
              variantCode: 'DUP-CODE',
              sizeId: 'size-m',
              inventoryCount: 1,
              rentalRates: [{ durationDays: 1, price: 50000 }],
            },
          ],
          media: [],
        }),
      ).rejects.toThrow(InvalidCatalogInputError);
    });

    it('rejects multiple primary images', async () => {
      await expect(
        service.createProduct(mockUser, {
          code: 'DRESS-04',
          name: 'Váy Ren',
          categoryId: 'cat-1',
          defaultDepositAmount: 0,
          isPublic: true,
          variants: [
            {
              variantCode: 'DRESS-04-S',
              inventoryCount: 1,
              rentalRates: [{ durationDays: 1, price: 50000 }],
            },
          ],
          media: [
            { url: 'https://example.com/1.jpg', isPrimary: true, sortOrder: 0 },
            { url: 'https://example.com/2.jpg', isPrimary: true, sortOrder: 1 },
          ],
        }),
      ).rejects.toThrow(InvalidCatalogInputError);
    });

    it('throws Error with code PRODUCT_SLUG_ALREADY_EXISTS when slug already exists', async () => {
      createProductMock.mockRejectedValue(new CatalogProductSlugAlreadyExistsError());

      try {
        await service.createProduct(mockUser, {
          code: 'PROD-COLLIDE',
          name: 'Váy đỏ',
          slug: 'ao-dai-do',
          categoryId: 'cat-1',
          defaultDepositAmount: 0,
          isPublic: true,
          variants: [
            {
              variantCode: 'PROD-COLLIDE-S',
              inventoryCount: 1,
              rentalRates: [{ durationDays: 1, price: 50000 }],
            },
          ],
          media: [],
        });
        fail('expected to throw Error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({
          code: 'PRODUCT_SLUG_ALREADY_EXISTS',
          message: 'Slug sản phẩm đã tồn tại trong cửa hàng.',
        });
      }
    });
  });

  describe('updateProduct', () => {
    it('updates core product fields without altering unprovided values', async () => {
      const updated: UpdateProductResult = {
        id: 'prod-1',
        shopId: mockUser.shopId,
        categoryId: 'cat-1',
        code: 'LEGACY-30K',
        name: 'Tên mới',
        slug: null,
        description: null,
        defaultDepositAmount: new Prisma.Decimal(0),
        replacementValue: new Prisma.Decimal(500000),
        facebookPostUrl: 'https://facebook.com/new-post',
        currency: 'VND',
        status: 'ACTIVE',
        isRentable: true,
        isPublic: true,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      };
      updateProductMock.mockResolvedValue(updated);

      const result = await service.updateProduct(mockUser, 'prod-1', {
        name: 'Tên mới',
        replacementValue: 500000,
        facebookPostUrl: 'https://facebook.com/new-post',
      });

      expect(result).toBe(updated);
      expect(updateProductMock).toHaveBeenCalledWith(
        mockUser.shopId,
        'prod-1',
        expect.objectContaining({
          name: 'Tên mới',
          replacementValue: 500000,
          facebookPostUrl: 'https://facebook.com/new-post',
        }),
      );
    });

    it('throws Error when product does not exist', async () => {
      updateProductMock.mockResolvedValue(null);
      await expect(
        service.updateProduct(mockUser, 'non-existent', { name: 'Test' }),
      ).rejects.toThrow(CatalogResourceNotFoundError);
    });

    it('throws Error with code PRODUCT_SLUG_ALREADY_EXISTS when updated slug collides', async () => {
      updateProductMock.mockRejectedValue(new CatalogProductSlugAlreadyExistsError());

      try {
        await service.updateProduct(mockUser, 'prod-1', { slug: 'already-used-slug' });
        fail('expected to throw Error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({
          code: 'PRODUCT_SLUG_ALREADY_EXISTS',
          message: 'Slug sản phẩm đã tồn tại trong cửa hàng.',
        });
      }
    });

    it('forwards explicit slug when provided in updateProduct', async () => {
      const updated: UpdateProductResult = {
        id: 'prod-1',
        shopId: mockUser.shopId,
        categoryId: 'cat-1',
        code: 'PROD-1',
        name: 'Váy dạ hội',
        slug: 'vay-da-hoi-moi',
        description: null,
        defaultDepositAmount: new Prisma.Decimal(0),
        replacementValue: null,
        facebookPostUrl: null,
        currency: 'VND',
        status: 'ACTIVE',
        isRentable: true,
        isPublic: true,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      };
      updateProductMock.mockResolvedValue(updated);

      await service.updateProduct(mockUser, 'prod-1', {
        name: 'Váy dạ hội mới',
        slug: 'vay-da-hoi-moi',
      });

      expect(updateProductMock).toHaveBeenCalledWith(
        mockUser.shopId,
        'prod-1',
        expect.objectContaining({
          name: 'Váy dạ hội mới',
          slug: 'vay-da-hoi-moi',
        }),
      );
    });
  });

  describe('archiveProduct', () => {
    it('archives product when no active rentals exist', async () => {
      archiveProductMock.mockResolvedValue(true);
      const result = await service.archiveProduct(mockUser, 'prod-1');
      expect(result).toEqual({ success: true });
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ARCHIVE', entityId: 'prod-1' }),
      );
    });

    it('throws Error when product has active rentals', async () => {
      archiveProductMock.mockRejectedValue(
        new CatalogInvariantError(
          CATALOG_ERROR_CODE.PRODUCT_ACTIVE_RENTAL,
          'Không thể lưu trữ sản phẩm đang có lịch thuê chưa kết thúc.',
        ),
      );
      await expect(service.archiveProduct(mockUser, 'prod-1')).rejects.toThrow(
        CatalogInvariantError,
      );
    });
  });
});
