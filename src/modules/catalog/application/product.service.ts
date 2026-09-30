import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CATALOG_PRODUCT_REPOSITORY,
  type CatalogProductRepository,
} from '../domain/catalog-product.repository';
import type {
  AddVariantInput,
  CreateProductInput,
  ProductListQuery,
  ProductMediaInput,
  UpdateProductInput,
  UpsertRentalRateInput,
} from './catalog.contracts';
import { withCatalogInvariant } from './catalog-invariant';

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
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');
    return (await this.repository.findProduct(user.shopId, product.id)) ?? product;
  }

  async createProduct(user: CurrentUser, input: CreateProductInput) {
    const duplicateVariantCodes = input.variants.map((item) => item.variantCode);
    if (new Set(duplicateVariantCodes).size !== duplicateVariantCodes.length) {
      throw new BadRequestException('Mã biến thể không được trùng nhau trong cùng yêu cầu.');
    }
    const seenCombinations = new Set<string>();
    for (const variant of input.variants) {
      const key = String(variant.sizeId ?? 'null') + '::' + String(variant.colorId ?? 'null');
      if (seenCombinations.has(key)) {
        throw new ConflictException(
          'Biến thể có cùng kích thước và màu sắc đã tồn tại trong sản phẩm.',
        );
      }
      seenCombinations.add(key);
      const durations = variant.rentalRates.map((rate) => rate.durationDays);
      if (new Set(durations).size !== durations.length) {
        throw new BadRequestException(
          'Số ngày trong các mức giá thuê của biến thể ' +
            variant.variantCode +
            ' không được trùng nhau.',
        );
      }
    }
    if (input.media.filter((item) => item.isPrimary).length > 1) {
      throw new BadRequestException('Chỉ được chọn một ảnh đại diện cho sản phẩm.');
    }
    const product = await withCatalogInvariant(() =>
      this.repository.createProduct(user.shopId, input),
    );
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'product',
      entityId: product?.id,
      newValues: { code: input.code, name: input.name },
    });
    return product;
  }

  async addVariant(user: CurrentUser, productId: string, input: AddVariantInput) {
    const variant = await withCatalogInvariant(() =>
      this.repository.addVariant(user.shopId, productId, input),
    );
    if (!variant) throw new NotFoundException('Không tìm thấy sản phẩm.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'product_variant',
      entityId: variant.id,
      newValues: { productId, variantCode: input.variantCode },
    });
    return variant;
  }

  async upsertRentalRate(user: CurrentUser, variantId: string, input: UpsertRentalRateInput) {
    const rate = await this.repository.upsertRentalRate(user.shopId, variantId, input);
    if (!rate) throw new NotFoundException('Không tìm thấy biến thể sản phẩm.');
    return rate;
  }

  async updateProduct(user: CurrentUser, id: string, input: UpdateProductInput) {
    const updated = await withCatalogInvariant(() =>
      this.repository.updateProduct(user.shopId, id, {
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
      }),
    );
    if (!updated) throw new NotFoundException('Không tìm thấy sản phẩm.');
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
    const archived = await withCatalogInvariant(() =>
      this.repository.archiveProduct(user.shopId, id),
    );
    if (!archived) throw new NotFoundException('Không tìm thấy sản phẩm.');
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
    if (!media) throw new NotFoundException('Không tìm thấy sản phẩm.');
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

  async removeProductMedia(user: CurrentUser, productId: string, mediaId: string) {
    const removed = await this.repository.removeProductMedia(user.shopId, productId, mediaId);
    if (!removed) throw new NotFoundException('Không tìm thấy hình ảnh sản phẩm.');
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
}
