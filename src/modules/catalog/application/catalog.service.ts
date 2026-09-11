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
  CatalogInvariantError,
  type CatalogRepository,
} from '../domain/catalog.repository';
import type {
  AddInventoryInput,
  AddVariantInput,
  AvailabilityQuery,
  CreateCategoryInput,
  CreateColorInput,
  CreateProductInput,
  CreateSizeInput,
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

  lookups(user: CurrentUser) {
    return this.repository.listLookups(user.shopId);
  }

  createCategory(user: CurrentUser, input: CreateCategoryInput) {
    return this.withInvariant(() => this.repository.createCategory(user.shopId, input));
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
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async createProduct(user: CurrentUser, input: CreateProductInput) {
    const duplicateVariantCodes = input.variants.map((item) => item.variantCode);
    if (new Set(duplicateVariantCodes).size !== duplicateVariantCodes.length) {
      throw new BadRequestException('Variant codes must be unique in the request');
    }
    const seenCombinations = new Set<string>();
    for (const variant of input.variants) {
      const key = `${variant.sizeId ?? 'null'}::${variant.colorId ?? 'null'}`;
      if (seenCombinations.has(key)) {
        throw new ConflictException('Duplicate variant combination for size and color in product');
      }
      seenCombinations.add(key);
      const durations = variant.rentalRates.map((rate) => rate.durationDays);
      if (new Set(durations).size !== durations.length) {
        throw new BadRequestException(
          `Rental rate durations must be unique for ${variant.variantCode}`,
        );
      }
    }
    if (input.media.filter((item) => item.isPrimary).length > 1) {
      throw new BadRequestException('Only one product image can be marked as primary');
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
    if (!variant) throw new NotFoundException('Product not found');
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
    if (!rate) throw new NotFoundException('Variant not found');
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
    if (!updated) throw new NotFoundException('Product not found');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'product',
      entityId: id,
      newValues: { ...input },
    });
    return updated;
  }

  async archiveProduct(user: CurrentUser, id: string) {
    const archived = await this.withInvariant(() =>
      this.repository.archiveProduct(user.shopId, id),
    );
    if (!archived) throw new NotFoundException('Product not found');
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
    if (!media) throw new NotFoundException('Product not found');
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
    if (!removed) throw new NotFoundException('Product media not found');
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
    if (!item) throw new NotFoundException('Variant not found');
    return item;
  }

  listInventory(user: CurrentUser, query: InventoryListQuery) {
    return this.repository.listInventory({ shopId: user.shopId, ...query });
  }

  async getInventory(user: CurrentUser, id: string) {
    const item = await this.repository.findInventoryItem(user.shopId, id);
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  async updateInventoryStatus(user: CurrentUser, id: string, input: UpdateInventoryStatusInput) {
    const allowed: ReadonlySet<string> = new Set(Object.values(INVENTORY_STATUS));
    if (!allowed.has(input.status)) throw new BadRequestException('Unsupported inventory status');
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
    if (!item) throw new NotFoundException('Inventory item not found');
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
    if (!archived) throw new NotFoundException('Inventory item not found');
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
    if (from >= until) throw new BadRequestException('from must be earlier than until');
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
        const msg = error.message.toLowerCase();
        if (
          msg.includes('duplicate') ||
          msg.includes('đã tồn tại') ||
          msg.includes('active rental') ||
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
