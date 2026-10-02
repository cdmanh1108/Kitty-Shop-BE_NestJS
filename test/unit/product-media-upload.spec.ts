import type { ObjectStoragePort } from '@common/storage/object-storage.port';
import type { AuditPort } from '@modules/audit/domain/audit.port';
import type { CurrentUser } from '@common/types/current-user';
import type { CatalogProductRepository } from '@modules/catalog/domain/catalog-product.repository';
import type { ProductMediaRecord } from '@modules/catalog/domain/catalog.records';
import { ProductService } from '@modules/catalog/application/product.service';
import {
  CatalogResourceNotFoundError,
  InvalidCatalogInputError,
} from '@modules/catalog/application/catalog-application.errors';
import { validateAndHashImage, buildProductMediaKey } from '@common/storage/storage-key.builder';

describe('ProductService managed product media', () => {
  const user: CurrentUser = {
    userId: 'user-1',
    memberId: 'member-1',
    shopId: 'shop-1',
    email: 'admin@kitty.vn',
    fullName: 'Admin',
    permissions: ['catalog.manage'],
  };
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const mediaRecord: ProductMediaRecord = {
    id: 'media-1',
    shopId: user.shopId,
    productId: 'product-1',
    variantId: null,
    mediaType: 'IMAGE',
    storageKey: 'shops/shop-a/products/dress-1/hash.jpg',
    url: 'https://assets.example.test/shops/shop-a/products/dress-1/hash.jpg',
    altText: null,
    sortOrder: 0,
    isPrimary: false,
    metadata: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  let repository: CatalogProductRepository;
  let storage: ObjectStoragePort;
  let auditLog: jest.MockedFunction<AuditPort['log']>;
  let cleanupLog: jest.MockedFunction<(message: unknown) => void>;
  let addMedia: jest.MockedFunction<CatalogProductRepository['addProductMedia']>;
  let findTarget: jest.MockedFunction<CatalogProductRepository['findProductMediaUploadTarget']>;
  let countByKey: jest.MockedFunction<CatalogProductRepository['countProductMediaByStorageKey']>;
  let removeMedia: jest.MockedFunction<CatalogProductRepository['removeProductMedia']>;
  let putObject: jest.MockedFunction<ObjectStoragePort['putObject']>;
  let deleteObject: jest.MockedFunction<ObjectStoragePort['deleteObject']>;
  let service: ProductService;

  beforeEach(() => {
    addMedia = jest.fn();
    findTarget = jest.fn().mockResolvedValue({ shopCode: 'Shop A', productCode: 'Dress 1' });
    countByKey = jest.fn().mockResolvedValue(0);
    removeMedia = jest.fn();
    repository = {
      lookupProducts: jest.fn(),
      listProducts: jest.fn(),
      findProduct: jest.fn(),
      createProduct: jest.fn(),
      addVariant: jest.fn(),
      updateProductVariant: jest.fn(),
      setProductVariantArchived: jest.fn(),
      deleteProductVariant: jest.fn(),
      upsertRentalRate: jest.fn(),
      updateProduct: jest.fn(),
      archiveProduct: jest.fn(),
      addProductMedia: addMedia,
      setPrimaryProductMedia: jest.fn(),
      findProductMediaUploadTarget: findTarget,
      countProductMediaByStorageKey: countByKey,
      removeProductMedia: removeMedia,
    };
    putObject = jest
      .fn()
      .mockImplementation((input: Parameters<ObjectStoragePort['putObject']>[0]) =>
        Promise.resolve({
          storageKey: input.key,
          publicUrl: `https://assets.example.test/${input.key}`,
        }),
      );
    deleteObject = jest.fn().mockResolvedValue(undefined);
    storage = {
      getObject: jest.fn(),
      putObject,
      headObject: jest.fn(),
      deleteObject,
      getPublicUrl: jest.fn(),
    };
    auditLog = jest.fn().mockResolvedValue(undefined);
    cleanupLog = jest.fn();
    service = new ProductService(repository, { log: auditLog }, storage, {
      create: () => ({ log: jest.fn(), error: cleanupLog }),
    });
  });

  it('rejects a missing file, invalid image bytes, and a mismatched declared MIME type', async () => {
    await expect(service.uploadProductMedia(user, 'product-1', {})).rejects.toBeInstanceOf(
      InvalidCatalogInputError,
    );
    await expect(
      service.uploadProductMedia(user, 'product-1', {
        file: { buffer: Buffer.from('<html>'), mimetype: 'image/jpeg' },
      }),
    ).rejects.toBeInstanceOf(InvalidCatalogInputError);
    await expect(
      service.uploadProductMedia(user, 'product-1', {
        file: { buffer: image, mimetype: 'image/png' },
      }),
    ).rejects.toBeInstanceOf(InvalidCatalogInputError);

    expect(putObject).not.toHaveBeenCalled();
    expect(addMedia).not.toHaveBeenCalled();
  });

  it('checks shop scope before writing and stores validated media through the existing repository port', async () => {
    findTarget.mockResolvedValueOnce(null);
    await expect(
      service.uploadProductMedia(user, 'other-shop-product', {
        file: { buffer: image, mimetype: 'image/jpeg' },
      }),
    ).rejects.toBeInstanceOf(CatalogResourceNotFoundError);
    expect(putObject).not.toHaveBeenCalled();

    findTarget.mockResolvedValueOnce({ shopCode: 'Shop A', productCode: 'Dress 1' });
    const inspected = validateAndHashImage(image, 'image/jpeg');
    const key = buildProductMediaKey({
      shopCode: 'Shop A',
      productCode: 'Dress 1',
      contentHash: inspected.contentHash,
      extension: inspected.extension,
    });
    const persistedMedia = {
      ...mediaRecord,
      storageKey: key,
      url: `https://assets.example.test/${key}`,
      altText: 'Front view',
    };
    addMedia.mockResolvedValueOnce(persistedMedia);
    const result = await service.uploadProductMedia(user, 'product-1', {
      file: { buffer: image, mimetype: 'image/jpeg' },
      altText: 'Front view',
    });
    expect(putObject).toHaveBeenCalledWith({
      key,
      body: image,
      contentType: 'image/jpeg',
    });
    expect(addMedia).toHaveBeenCalledWith(user.shopId, 'product-1', {
      url: `https://assets.example.test/${key}`,
      storageKey: key,
      altText: 'Front view',
      isPrimary: false,
      sortOrder: 0,
    });
    expect(result).toBe(persistedMedia);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'product_media' }),
    );
    expect(auditLog.mock.calls[0]?.[0].newValues).toEqual(
      expect.objectContaining({ storageKey: key }),
    );
  });

  it('cleans up an unreferenced object after persistence fails and preserves the persistence error', async () => {
    const persistenceError = new Error('database unavailable');
    addMedia.mockRejectedValueOnce(persistenceError);

    await expect(
      service.uploadProductMedia(user, 'product-1', {
        file: { buffer: image, mimetype: 'image/jpeg' },
      }),
    ).rejects.toBe(persistenceError);

    expect(countByKey).toHaveBeenCalledWith(
      expect.stringMatching(/^shops\/shop_a\/products\/dress_1\//),
    );
    expect(deleteObject).toHaveBeenCalledWith(expect.any(String), { purpose: 'cleanup' });
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('does not replace a persistence error when best-effort upload cleanup also fails', async () => {
    const persistenceError = new Error('database unavailable');
    addMedia.mockRejectedValueOnce(persistenceError);
    deleteObject.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(
      service.uploadProductMedia(user, 'product-1', {
        file: { buffer: image, mimetype: 'image/jpeg' },
      }),
    ).rejects.toBe(persistenceError);

    expect(cleanupLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'catalog.product_media.storage_cleanup_failed',
        operation: 'upload',
      }),
    );
  });

  it('keeps shared managed media objects and never tries to delete external media URLs', async () => {
    countByKey.mockResolvedValueOnce(1);
    removeMedia.mockResolvedValueOnce({ storageKey: 'shared/key.jpg' });
    await service.removeProductMedia(user, 'product-1', 'media-shared');
    expect(countByKey).toHaveBeenCalledWith('shared/key.jpg');
    expect(deleteObject).not.toHaveBeenCalled();

    removeMedia.mockResolvedValueOnce({ storageKey: null });
    await service.removeProductMedia(user, 'product-1', 'media-external');
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('keeps a successful DB deletion when object cleanup fails', async () => {
    removeMedia.mockResolvedValueOnce({ storageKey: 'unreferenced/key.jpg' });
    deleteObject.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(service.removeProductMedia(user, 'product-1', 'media-1')).resolves.toEqual({
      success: true,
    });
    expect(cleanupLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'catalog.product_media.storage_cleanup_failed',
        operation: 'delete',
        storageKey: 'unreferenced/key.jpg',
        errorClass: 'Error',
      }),
    );
  });
});
