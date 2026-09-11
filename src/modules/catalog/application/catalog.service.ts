import type { CurrentUser } from '@common/types/current-user';
import { AuditService } from '@modules/audit/application/audit.service';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
    private readonly audit: AuditService,
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
    for (const variant of input.variants) {
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

  async addProductMedia(user: CurrentUser, productId: string, input: ProductMediaInput) {
    const media = await this.repository.addProductMedia(user.shopId, productId, input);
    if (!media) throw new NotFoundException('Product not found');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'product_media',
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
    const allowed = new Set([
      'AVAILABLE',
      'RESERVED',
      'RENTED',
      'CLEANING',
      'REPAIRING',
      'DAMAGED',
      'LOST',
      'RETIRED',
    ]);
    if (!allowed.has(input.status)) throw new BadRequestException('Unsupported inventory status');
    const item = await this.repository.updateInventoryStatus({
      shopId: user.shopId,
      id,
      status: input.status,
      condition: input.condition,
      reason: input.reason,
      notes: input.notes,
      changedBy: user.memberId,
    });
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
      if (error instanceof CatalogInvariantError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
