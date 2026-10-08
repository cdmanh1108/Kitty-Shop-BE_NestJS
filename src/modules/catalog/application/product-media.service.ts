import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/public/audit-contracts';
import {
  APPLICATION_LOGGER,
  silentApplicationLog,
  type ApplicationLog,
  type ApplicationLoggerFactory,
} from '@common/logging/application-logger.port';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '@common/storage/object-storage.port';
import { buildProductMediaKey, validateAndHashImage } from '@common/storage/storage-key.builder';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CATALOG_PRODUCT_REPOSITORY,
  type CatalogProductRepository,
} from '../domain/catalog-product.repository';
import type { ProductMediaRecord } from '../domain/catalog.records';
import type { ProductMediaInput, ProductMediaUploadInput } from './catalog.contracts';
import {
  CatalogResourceNotFoundError,
  InvalidCatalogInputError,
} from './catalog-application.errors';

@Injectable()
export class ProductMediaService {
  private readonly logger: ApplicationLog;

  constructor(
    @Inject(CATALOG_PRODUCT_REPOSITORY) private readonly repository: CatalogProductRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
    @Optional() @Inject(APPLICATION_LOGGER) loggerFactory?: ApplicationLoggerFactory,
  ) {
    this.logger = loggerFactory?.create(ProductMediaService.name) ?? silentApplicationLog;
  }

  async addProductMedia(user: CurrentUser, productId: string, input: ProductMediaInput) {
    const media = await this.repository.addProductMedia(user.shopId, productId, input);
    if (!media) throw new CatalogResourceNotFoundError('Không tìm thấy sản phẩm.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'product_media',
      entityId: media.id,
      newValues: { productId, url: input.url },
    });
    return media;
  }

  async setPrimaryProductMedia(user: CurrentUser, productId: string, mediaId: string) {
    const media = await this.repository.setPrimaryProductMedia(user.shopId, productId, mediaId);
    if (!media) throw new CatalogResourceNotFoundError('Không tìm thấy hình ảnh sản phẩm.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'product_media',
      entityId: media.id,
      newValues: { productId, isPrimary: true },
    });
    return media;
  }

  async uploadProductMedia(user: CurrentUser, productId: string, input: ProductMediaUploadInput) {
    const file = input.file;
    if (!file) throw new InvalidCatalogInputError('Cần tải lên tệp ảnh sản phẩm.');
    const target = await this.repository.findProductMediaUploadTarget(user.shopId, productId);
    if (!target) throw new CatalogResourceNotFoundError('Không tìm thấy sản phẩm.');

    let image;
    try {
      image = validateAndHashImage(file.buffer, file.mimetype);
    } catch (error) {
      throw new InvalidCatalogInputError(
        error instanceof Error ? error.message : 'Tệp ảnh sản phẩm không hợp lệ.',
      );
    }
    if (file.mimetype !== image.mimeType) {
      throw new InvalidCatalogInputError('Loại tệp không khớp nội dung hình ảnh.');
    }

    const storageKey = buildProductMediaKey({
      shopCode: target.shopCode,
      productCode: target.productCode,
      contentHash: image.contentHash,
      extension: image.extension,
    });

    let media: ProductMediaRecord | null;
    try {
      const stored = await this.storage.putObject({
        key: storageKey,
        body: file.buffer,
        contentType: image.mimeType,
      });
      media = await this.repository.addProductMedia(user.shopId, productId, {
        url: stored.publicUrl,
        storageKey,
        altText: input.altText,
        isPrimary: input.isPrimary ?? false,
        sortOrder: input.sortOrder ?? 0,
      });
      if (!media) throw new CatalogResourceNotFoundError('Không tìm thấy sản phẩm.');
    } catch (error) {
      await this.cleanupUnreferencedProductMedia(user.shopId, productId, storageKey, 'upload');
      throw error;
    }

    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'product_media',
      entityId: media.id,
      newValues: {
        productId,
        storageKey: media.storageKey,
        isPrimary: media.isPrimary,
        sortOrder: media.sortOrder,
        altText: media.altText,
      },
    });
    return media;
  }

  async removeProductMedia(user: CurrentUser, productId: string, mediaId: string) {
    const removed = await this.repository.removeProductMedia(user.shopId, productId, mediaId);
    if (!removed) throw new CatalogResourceNotFoundError('Không tìm thấy hình ảnh sản phẩm.');
    if (removed.storageKey) {
      await this.cleanupUnreferencedProductMedia(
        user.shopId,
        productId,
        removed.storageKey,
        'delete',
      );
    }
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'DELETE',
      entityType: 'product_media',
      entityId: mediaId,
      newValues: { productId },
    });
    return { success: true as const };
  }

  private async cleanupUnreferencedProductMedia(
    shopId: string,
    productId: string,
    storageKey: string,
    operation: 'upload' | 'delete',
  ): Promise<void> {
    try {
      const references = await this.repository.countProductMediaByStorageKey(storageKey);
      if (references > 0) return;
      await this.storage.deleteObject(storageKey, { purpose: 'cleanup' });
    } catch (error) {
      this.logger.error({
        event: 'catalog.product_media.storage_cleanup_failed',
        operation,
        shopId,
        productId,
        storageKey,
        errorClass: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
    }
  }
}
