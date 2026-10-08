import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/public/audit-contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_PRODUCT_REPOSITORY,
  type CatalogProductRepository,
} from '../domain/catalog-product.repository';
import type {
  AddVariantInput,
  CreateProductInput,
  ProductListQuery,
  UpdateProductInput,
  UpdateProductVariantInput,
  UpsertRentalRateInput,
} from './catalog.contracts';
import type { ProductVariantRecord } from '../domain/catalog.records';
import { CATALOG_ERROR_CODE, CatalogInvariantError } from '../domain/catalog-errors';
import {
  CatalogResourceNotFoundError,
  DuplicateProductVariantCombinationError,
  InvalidCatalogInputError,
} from './catalog-application.errors';

@Injectable()
export class ProductService {
  constructor(
    @Inject(CATALOG_PRODUCT_REPOSITORY) private readonly repository: CatalogProductRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

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
