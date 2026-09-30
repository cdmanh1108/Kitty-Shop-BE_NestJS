import type { InventoryHistoryCriteria } from '../domain/catalog.read-models';
import { INVENTORY_STATUS } from '../domain/catalog-status';
import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CATALOG_INVENTORY_REPOSITORY,
  type CatalogInventoryRepository,
} from '../domain/catalog-inventory.repository';
import type {
  AddInventoryInput,
  AvailabilityQuery,
  InventoryListQuery,
  UpdateInventoryStatusInput,
} from './catalog.contracts';
import { withCatalogInvariant } from './catalog-invariant';

@Injectable()
export class InventoryService {
  constructor(
    @Inject(CATALOG_INVENTORY_REPOSITORY) private readonly repository: CatalogInventoryRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  inventorySummary(user: CurrentUser) {
    return this.repository.inventorySummary(user.shopId);
  }

  inventoryHistory(user: CurrentUser, query: Omit<InventoryHistoryCriteria, 'shopId'>) {
    return this.repository.inventoryHistory({ ...query, shopId: user.shopId });
  }

  async addInventory(user: CurrentUser, input: AddInventoryInput) {
    const item = await withCatalogInvariant(() =>
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
    const item = await withCatalogInvariant(() =>
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
    const archived = await withCatalogInvariant(() =>
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
}
