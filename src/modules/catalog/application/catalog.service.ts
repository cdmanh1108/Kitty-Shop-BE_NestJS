import type { InventoryHistoryCriteria } from '../domain/catalog.read-models';
import { INVENTORY_STATUS } from '../domain/catalog-status';
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
  CATALOG_REPOSITORY,
  CatalogCategoryError,
  CatalogInvariantError,
  CatalogCategoryCodeAlreadyExistsError,
  type CatalogRepository,
} from '../domain/catalog.repository';
import type {
  AddInventoryInput,
  AddVariantInput,
  AvailabilityQuery,
  CreateCategoryInput,
  CategoryListQuery,
  CreateColorInput,
  CreateProductInput,
  CreateSizeInput,
  UpdateCategoryInput,
  InventoryListQuery,
  ProductListQuery,
  ProductMediaInput,
  UpdateInventoryStatusInput,
  UpdateProductInput,
  UpsertRentalRateInput,
} from './catalog.contracts';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repository: CatalogRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  lookupProducts(user: CurrentUser, query: ProductListQuery & { productId?: string }) {
    return this.repository.lookupProducts({ ...query, shopId: user.shopId });
  }

  inventorySummary(user: CurrentUser) {
    return this.repository.inventorySummary(user.shopId);
  }

  inventoryHistory(user: CurrentUser, query: Omit<InventoryHistoryCriteria, 'shopId'>) {
    return this.repository.inventoryHistory({ ...query, shopId: user.shopId });
  }

  lookups(user: CurrentUser) {
    return this.repository.listLookups(user.shopId);
  }

  listCategories(user: CurrentUser, query: CategoryListQuery) {
    return this.repository.listCategories({ shopId: user.shopId, ...query });
  }

  categoryOptions(user: CurrentUser, includeInactive = false) {
    return this.repository.categoryOptions(user.shopId, includeInactive);
  }

  async createCategory(user: CurrentUser, input: CreateCategoryInput) {
    const name = input.name.trim();
    const code = (
      input.code?.trim() ||
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/Đ/g, 'D')
        .replace(/đ/g, 'd')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    ).toUpperCase();
    const created = await this.withInvariant(() =>
      this.repository.createCategory(user.shopId, {
        code,
        name,
        description: input.description?.trim() || undefined,
        status: input.status ?? 'ACTIVE',
        sortOrder: input.sortOrder ?? 0,
      }),
    );
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'category',
      entityId: created.id,
      newValues: { code, name, status: input.status ?? 'ACTIVE', sortOrder: input.sortOrder ?? 0 },
    });
    return created;
  }

  async updateCategory(user: CurrentUser, id: string, input: UpdateCategoryInput) {
    const code = input.code?.trim() ? input.code.trim().toUpperCase() : undefined;
    const updated = await this.withInvariant(() =>
      this.repository.updateCategory(user.shopId, id, {
        ...input,
        code,
        name: input.name?.trim(),
        description: input.description === null ? null : input.description?.trim() || undefined,
      }),
    );
    if (!updated)
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Không tìm thấy danh mục.',
      });
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: input.status ? 'STATUS_CHANGE' : 'UPDATE',
      entityType: 'category',
      entityId: id,
      newValues: { ...input, ...(code ? { code } : {}) },
    });
    return updated;
  }

  async deleteCategory(user: CurrentUser, id: string) {
    const result = await this.repository.deleteCategory(user.shopId, id);
    if (result === 'not-found')
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Không tìm thấy danh mục.',
      });
    if (result === 'in-use')
      throw new ConflictException({
        code: 'CATEGORY_IN_USE',
        message: 'Danh mục đang được sử dụng bởi sản phẩm.',
      });
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'DELETE',
      entityType: 'category',
      entityId: id,
    });
    return { deleted: true as const };
  }

  createSize(user: CurrentUser, input: CreateSizeInput) {
    return this.repository.createSize(user.shopId, input);
  }

  createColor(user: CurrentUser, input: CreateColorInput) {
    return this.repository.createColor(user.shopId, input);
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
      const key = `${variant.sizeId ?? 'null'}::${variant.colorId ?? 'null'}`;
      if (seenCombinations.has(key)) {
        throw new ConflictException(
          'Biến thể có cùng kích thước và màu sắc đã tồn tại trong sản phẩm.',
        );
      }
      seenCombinations.add(key);
      const durations = variant.rentalRates.map((rate) => rate.durationDays);
      if (new Set(durations).size !== durations.length) {
        throw new BadRequestException(
          `Số ngày trong các mức giá thuê của biến thể ${variant.variantCode} không được trùng nhau.`,
        );
      }
    }
    if (input.media.filter((item) => item.isPrimary).length > 1) {
      throw new BadRequestException('Chỉ được chọn một ảnh đại diện cho sản phẩm.');
    }
    const product = await this.withInvariant(() =>
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
    const variant = await this.withInvariant(() =>
      this.repository.addVariant(user.shopId, productId, input),
    );
    if (!variant) throw new NotFoundException('Không tìm thấy sản phẩm.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'product_variant',
      entityId: variant?.id,
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
    const updated = await this.withInvariant(() =>
      this.repository.updateProduct(user.shopId, id, {
        name: input.name,
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
    const archived = await this.withInvariant(() =>
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
      entityId: media?.id,
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

  async addInventory(user: CurrentUser, input: AddInventoryInput) {
    const item = await this.withInvariant(() =>
      this.repository.addInventoryItem(user.shopId, {
        ...input,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : undefined,
      }),
    );
    if (!item) throw new NotFoundException('Không tìm thấy biến thể sản phẩm.');
    return item;
  }

  listInventory(user: CurrentUser, query: InventoryListQuery) {
    return this.repository.listInventory({ shopId: user.shopId, ...query });
  }

  async getInventory(user: CurrentUser, id: string) {
    const item = await this.repository.findInventoryItem(user.shopId, id);
    if (!item) throw new NotFoundException('Không tìm thấy món đồ trong kho.');
    return item;
  }

  async updateInventoryStatus(user: CurrentUser, id: string, input: UpdateInventoryStatusInput) {
    const allowed: ReadonlySet<string> = new Set(Object.values(INVENTORY_STATUS));
    if (!allowed.has(input.status)) throw new BadRequestException('Trạng thái kho không hợp lệ.');
    const item = await this.withInvariant(() =>
      this.repository.updateInventoryStatus({
        shopId: user.shopId,
        id,
        status: input.status,
        expectedFromStatus: input.expectedFromStatus,
        condition: input.condition,
        reason: input.reason,
        notes: input.notes,
        changedBy: user.memberId,
      }),
    );
    if (!item) throw new NotFoundException('Không tìm thấy món đồ trong kho.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'STATUS_CHANGE',
      entityType: 'inventory_item',
      entityId: id,
      newValues: { status: input.status, reason: input.reason },
    });
    return item;
  }

  async archiveInventoryItem(user: CurrentUser, id: string, reason?: string) {
    const archived = await this.withInvariant(() =>
      this.repository.archiveInventoryItem(user.shopId, id, reason, user.memberId),
    );
    if (!archived) throw new NotFoundException('Không tìm thấy món đồ trong kho.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'ARCHIVE',
      entityType: 'inventory_item',
      entityId: id,
      newValues: { reason },
    });
    return { success: true as const };
  }

  availability(user: CurrentUser, query: AvailabilityQuery) {
    const from = new Date(query.from);
    const until = new Date(query.until);
    if (from >= until)
      throw new BadRequestException('Thời gian bắt đầu phải trước thời gian kết thúc.');
    return this.repository.findAvailableInventory({
      shopId: user.shopId,
      variantId: query.variantId,
      from,
      until,
    });
  }
  private async withInvariant<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof CatalogInvariantError) {
        if (error instanceof CatalogCategoryError) {
          if (error.code === 'CATEGORY_NOT_FOUND')
            throw new NotFoundException({ code: error.code, message: error.message });
          throw new ConflictException({ code: error.code, message: error.message });
        }
        if (error instanceof CatalogCategoryCodeAlreadyExistsError)
          throw new ConflictException({
            code: error.code,
            message: 'Mã danh mục đã tồn tại.',
          });
        const msg = error.message.toLowerCase();
        if (
          msg.includes('duplicate') ||
          msg.includes('đã tồn tại') ||
          msg.includes('lịch thuê') ||
          msg.includes('lịch đặt') ||
          msg.includes('đang được thuê') ||
          msg.includes('thay đổi')
        ) {
          throw new ConflictException(error.message);
        }
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
