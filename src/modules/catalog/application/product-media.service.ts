import type { CurrentUser } from '@common/types/current-user';
import {
  noStorefrontCacheInvalidation,
  STOREFRONT_CACHE_INVALIDATOR,
  type StorefrontCacheInvalidator,
} from '@common/storefront-cache/storefront-cache.port';
import { createHash, randomUUID } from 'node:crypto';
import { CLOCK, type Clock } from '@common/clock/clock';
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
  type ProductMediaUploadOwner,
} from '../domain/catalog-product.repository';
import type { ProductMediaRecord } from '../domain/catalog.records';
import type { ProductMediaInput, ProductMediaUploadInput } from './catalog.contracts';
import {
  CatalogResourceNotFoundError,
  InvalidCatalogInputError,
  ProductMediaUploadConflictError,
} from './catalog-application.errors';

@Injectable()
export class ProductMediaService {
  private readonly logger: ApplicationLog;

  constructor(
    @Inject(CATALOG_PRODUCT_REPOSITORY) private readonly repository: CatalogProductRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional() @Inject(APPLICATION_LOGGER) loggerFactory?: ApplicationLoggerFactory,
    @Inject(STOREFRONT_CACHE_INVALIDATOR)
    private readonly storefrontCache: StorefrontCacheInvalidator = noStorefrontCacheInvalidation,
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
    await this.storefrontCache.invalidate('products');
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
    await this.storefrontCache.invalidate('products');
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

    const options = {
      altText: input.altText,
      isPrimary: input.isPrimary ?? false,
      sortOrder: input.sortOrder ?? 0,
    };
    let intent: ProductMediaUploadOwner | undefined;
    if (input.uploadIntentId) {
      const now = this.clock.now();
      const scope = 'product-media.upload:' + productId;
      const key = input.uploadIntentId.toLowerCase();
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ imageHash: image.contentHash, ...options }))
        .digest('hex');
      const claim = await this.repository.claimProductMediaUpload(
        user.shopId,
        productId,
        { scope, key, requestHash, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
        now,
      );
      if (claim.state === 'COMPLETED') {
        if (claim.media) return claim.media;
        throw new ProductMediaUploadConflictError(
          'Ảnh từ lượt tải này đã được gỡ.',
          'MEDIA_UPLOAD_REMOVED',
        );
      }
      if (claim.state !== 'CLAIMED') {
        throw new ProductMediaUploadConflictError(
          claim.state === 'HASH_MISMATCH'
            ? 'Nội dung của lượt tải ảnh đã thay đổi.'
            : 'Lượt tải ảnh đang được xử lý. Vui lòng thử lại.',
          claim.state === 'HASH_MISMATCH' ? 'MEDIA_UPLOAD_CHANGED' : 'MEDIA_UPLOAD_IN_PROGRESS',
        );
      }
      intent = { scope, key, claimId: claim.claimId, completedAt: now };
    }

    const storageKey = buildProductMediaKey({
      shopCode: target.shopCode,
      productCode: target.productCode,
      contentHash: image.contentHash,
      extension: image.extension,
      generation: randomUUID(),
    });

    let media: ProductMediaRecord | null;
    try {
      const stored = await this.storage.putObject({
        key: storageKey,
        body: file.buffer,
        contentType: image.mimeType,
      });
      media = await this.repository.addProductMedia(
        user.shopId,
        productId,
        { url: stored.publicUrl, storageKey, ...options },
        intent && { ...intent, completedAt: this.clock.now() },
      );
      if (!media) throw new CatalogResourceNotFoundError('Không tìm thấy sản phẩm.');
    } catch (error) {
      await this.cleanupUnreferencedProductMedia(user.shopId, productId, storageKey, 'upload');
      if (intent) {
        try {
          await this.repository.releaseProductMediaUpload(user.shopId, intent);
        } catch (releaseError) {
          this.logger.error({
            event: 'catalog.product_media.upload_claim_release_failed',
            productId,
            errorClass: releaseError instanceof Error ? releaseError.name : 'UnknownError',
          });
        }
      }
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
    await this.storefrontCache.invalidate('products');
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
    await this.storefrontCache.invalidate('products');
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
