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
import type {
  AddVariantInput,
  CreateProductInput,
  ProductListQuery,
  ProductMediaInput,
  ProductMediaUploadInput,
  UpdateProductInput,
  UpdateProductVariantInput,
  UpsertRentalRateInput,
} from './catalog.contracts';
import type { ProductMediaRecord } from '../domain/catalog.records';
import type { ProductVariantRecord } from '../domain/catalog.records';
import { CATALOG_ERROR_CODE, CatalogInvariantError } from '../domain/catalog-errors';
import {
  CatalogResourceNotFoundError,
  DuplicateProductVariantCombinationError,
  InvalidCatalogInputError,
} from './catalog-application.errors';

@Injectable()
export class ProductService {
  private readonly logger: ApplicationLog;

  constructor(
    @Inject(CATALOG_PRODUCT_REPOSITORY) private readonly repository: CatalogProductRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
    @Optional() @Inject(APPLICATION_LOGGER) loggerFactory?: ApplicationLoggerFactory,
  ) {
    this.logger = loggerFactory?.create(ProductService.name) ?? silentApplicationLog;
  }

  lookupProducts(user: CurrentUser, query: ProductListQuery & { productId?: string }) {
    return this.repository.lookupProducts({ ...query, shopId: user.shopId });
  }

  listProducts(user: CurrentUser, query: ProductListQuery) {
    return this.repository.listProducts({ shopId: user.shopId, ...query });
  }

  async getProduct(user: CurrentUser, id: string) {
    const product = await this.repository.findProduct(user.shopId, id);
    if (!product) throw new CatalogResourceNotFoundError('Không tìm thấy sản phẩm.');
    return (await this.repository.findProduct(user.shopId, product.id)) ?? product;
  }

  async createProduct(user: CurrentUser, input: CreateProductInput) {
    const allowFreeAccessory = input.allowFreeAccessory ?? false;
    const normalizedVariants = input.variants.map((item) => ({
      ...item,
      variantCode: normalizeVariantCode(item.variantCode),
    }));
    const normalizedInput = { ...input, allowFreeAccessory, variants: normalizedVariants };
    const duplicateVariantCodes = normalizedVariants.map((item) => item.variantCode);
    if (new Set(duplicateVariantCodes).size !== duplicateVariantCodes.length) {
      throw new InvalidCatalogInputError('Mã biến thể không được trùng nhau trong cùng yêu cầu.');
    }
    const seenCombinations = new Set<string>();
    for (const variant of normalizedVariants) {
      const key = String(variant.sizeId ?? 'null') + '::' + String(variant.colorId ?? 'null');
      if (seenCombinations.has(key)) {
        throw new DuplicateProductVariantCombinationError(
          'Biến thể có cùng kích thước và màu sắc đã tồn tại trong sản phẩm.',
        );
      }
      seenCombinations.add(key);
      const durations = variant.rentalRates.map((rate) => rate.durationDays);
      if (new Set(durations).size !== durations.length) {
        throw new InvalidCatalogInputError(
          'Số ngày trong các mức giá thuê của biến thể ' +
            variant.variantCode +
            ' không được trùng nhau.',
        );
      }
    }
    if (input.media.filter((item) => item.isPrimary).length > 1) {
      throw new InvalidCatalogInputError('Chỉ được chọn một ảnh đại diện cho sản phẩm.');
    }
    const product = await this.repository.createProduct(user.shopId, normalizedInput);
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'product',
      entityId: product?.id,
      newValues: { code: input.code, name: input.name, allowFreeAccessory },
    });
    return product;
  }

  async addVariant(user: CurrentUser, productId: string, input: AddVariantInput) {
    const normalizedInput = { ...input, variantCode: normalizeVariantCode(input.variantCode) };
    const variant = await this.repository.addVariant(user.shopId, productId, normalizedInput);
    if (!variant) throw new CatalogResourceNotFoundError('Không tìm thấy sản phẩm.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'product_variant',
      entityId: variant.id,
      newValues: { productId, variantCode: normalizedInput.variantCode },
    });
    return variant;
  }

  async upsertRentalRate(user: CurrentUser, variantId: string, input: UpsertRentalRateInput) {
    const rate = await this.repository.upsertRentalRate(user.shopId, variantId, input);
    if (!rate) throw new CatalogResourceNotFoundError('Không tìm thấy biến thể sản phẩm.');
    return rate;
  }

  async updateProductVariant(
    user: CurrentUser,
    productId: string,
    variantId: string,
    input: UpdateProductVariantInput,
  ) {
    const normalizedInput = {
      ...input,
      ...(input.variantCode === undefined
        ? {}
        : { variantCode: normalizeVariantCode(input.variantCode) }),
    };
    const result = await this.repository.updateProductVariant(
      user.shopId,
      productId,
      variantId,
      normalizedInput,
    );
    if (!result) throw this.variantNotFoundError();
    if (result.changed) {
      await this.audit.log({
        shopId: user.shopId,
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        action: 'UPDATE',
        entityType: 'product_variant',
        entityId: variantId,
        oldValues: variantAuditSnapshot(result.before),
        newValues: variantAuditSnapshot(result.variant),
      });
    }
    return result.details;
  }

  async setProductVariantArchived(
    user: CurrentUser,
    productId: string,
    variantId: string,
    archived: boolean,
  ) {
    const result = await this.repository.setProductVariantArchived(
      user.shopId,
      productId,
      variantId,
      archived,
    );
    if (!result) throw this.variantNotFoundError();
    if (result.changed) {
      await this.audit.log({
        shopId: user.shopId,
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        action: archived ? 'ARCHIVE' : 'REACTIVATE',
        entityType: 'product_variant',
        entityId: variantId,
        oldValues: variantAuditSnapshot(result.before),
        newValues: variantAuditSnapshot(result.variant),
      });
    }
    return result.details;
  }

  async deleteProductVariant(user: CurrentUser, productId: string, variantId: string) {
    const result = await this.repository.deleteProductVariant(user.shopId, productId, variantId);
    if (result.kind === 'NOT_FOUND') throw this.variantNotFoundError();
    if (result.kind === 'IN_USE') {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.PRODUCT_VARIANT_IN_USE,
        'Không thể xóa biến thể đang được tồn kho hoặc lịch sử đơn thuê sử dụng. Hãy lưu trữ biến thể nếu không còn muốn sử dụng.',
      );
    }
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'DELETE',
      entityType: 'product_variant',
      entityId: variantId,
      oldValues: variantAuditSnapshot(result.variant),
      newValues: { productId, deleted: true },
    });
    return { success: true as const };
  }

  private variantNotFoundError() {
    return new CatalogResourceNotFoundError(
      'Không tìm thấy biến thể trong sản phẩm thuộc cửa hàng đã xác thực.',
      CATALOG_ERROR_CODE.PRODUCT_VARIANT_NOT_FOUND,
    );
  }

  async updateProduct(user: CurrentUser, id: string, input: UpdateProductInput) {
    const updated = await this.repository.updateProduct(user.shopId, id, {
      allowFreeAccessory: input.allowFreeAccessory,
      name: input.name,
      slug: input.slug,
      categoryId: input.categoryId,
      description: input.description,
      defaultDepositAmount: input.defaultDepositAmount,
      replacementValue: input.replacementValue,
      facebookPostUrl: input.facebookPostUrl,
      isPublic: input.isPublic,
      isRentable: input.isRentable,
      status: input.status,
    });
    if (!updated) throw new CatalogResourceNotFoundError('Không tìm thấy sản phẩm.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'product',
      entityId: id,
      newValues: { ...input },
    });
    return (await this.repository.findProduct(user.shopId, id)) ?? updated;
  }

  async archiveProduct(user: CurrentUser, id: string) {
    const archived = await this.repository.archiveProduct(user.shopId, id);
    if (!archived) throw new CatalogResourceNotFoundError('Không tìm thấy sản phẩm.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'ARCHIVE',
      entityType: 'product',
      entityId: id,
    });
    return { success: true as const };
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

function normalizeVariantCode(value: string): string {
  if (typeof value !== 'string') {
    throw new InvalidCatalogInputError('Mã biến thể phải là chuỗi ký tự.');
  }
  const variantCode = value.trim();
  if (variantCode.length === 0 || variantCode.length > 100) {
    throw new InvalidCatalogInputError('Mã biến thể không được để trống và tối đa 100 ký tự.');
  }
  return variantCode;
}

function variantAuditSnapshot(variant: ProductVariantRecord) {
  return {
    id: variant.id,
    variantId: variant.id,
    productId: variant.productId,
    variantCode: variant.variantCode,
    sizeId: variant.sizeId,
    colorId: variant.colorId,
    depositAmountOverride: variant.depositAmountOverride?.toString() ?? null,
    archivedAt: variant.archivedAt?.toISOString() ?? null,
  };
}
