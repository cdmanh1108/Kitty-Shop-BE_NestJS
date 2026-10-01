import type { CurrentUser } from '@common/types/current-user';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import {
  CATALOG_SIZE_REPOSITORY,
  type CatalogSizeRepository,
} from '../domain/catalog-size.repository';
import { CATALOG_ERROR_CODE, CatalogSizeError } from '../domain/catalog-errors';
import {
  normalizeSizeCode,
  normalizeSizeName,
  normalizeSizeSortOrder,
} from '../domain/catalog-master-data.rules';
import type { SizePage } from '../domain/catalog.models';
import type { SizeRecord } from '../domain/catalog.records';
import type { CreateSizeInput, SizeListQuery, UpdateSizeInput } from './catalog.contracts';

function sizeSnapshot(size: SizeRecord) {
  return {
    id: size.id,
    code: size.code,
    name: size.name,
    sortOrder: size.sortOrder,
    isActive: size.isActive,
  };
}

@Injectable()
export class SizeService {
  constructor(
    @Inject(CATALOG_SIZE_REPOSITORY) private readonly repository: CatalogSizeRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  listSizes(user: CurrentUser, query: SizeListQuery): Promise<SizePage> {
    return this.repository.listSizes({
      shopId: user.shopId,
      page: query.page,
      limit: query.limit,
      q: query.q?.trim() || undefined,
      status: query.status ?? 'ALL',
    });
  }

  async getSize(user: CurrentUser, id: string): Promise<SizeRecord> {
    const size = await this.repository.findSizeById(user.shopId, id);
    if (!size) throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_NOT_FOUND);
    return size;
  }

  async createSize(user: CurrentUser, input: CreateSizeInput): Promise<SizeRecord> {
    const normalized = {
      code: normalizeSizeCode(input.code),
      name: normalizeSizeName(input.name),
      sortOrder: normalizeSizeSortOrder(input.sortOrder),
    };
    if (await this.repository.findSizeByCode(user.shopId, normalized.code)) {
      throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_CODE_ALREADY_EXISTS);
    }
    const created = await this.repository.createSize(user.shopId, normalized);
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'size',
      entityId: created.id,
      newValues: {
        id: created.id,
        code: created.code,
        name: created.name,
        sortOrder: created.sortOrder,
        isActive: created.isActive,
      },
    });
    return created;
  }

  async updateSize(user: CurrentUser, id: string, input: UpdateSizeInput): Promise<SizeRecord> {
    const existing = await this.repository.findSizeById(user.shopId, id);
    if (!existing) throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_NOT_FOUND);

    const code = input.code === undefined ? undefined : normalizeSizeCode(input.code);
    if (code !== undefined) {
      const duplicate = await this.repository.findSizeByCode(user.shopId, code);
      if (duplicate && duplicate.id !== id) {
        throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_CODE_ALREADY_EXISTS);
      }
    }
    const name = input.name === undefined ? undefined : normalizeSizeName(input.name);
    const sortOrder =
      input.sortOrder === undefined ? undefined : normalizeSizeSortOrder(input.sortOrder);
    const changes = {
      ...(code !== undefined ? { code } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    };
    if (Object.keys(changes).length === 0) return existing;

    const updated = await this.repository.updateSize(user.shopId, id, changes);
    if (!updated) throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_NOT_FOUND);
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'size',
      entityId: updated.id,
      oldValues: sizeSnapshot(existing),
      newValues: sizeSnapshot(updated),
    });
    return updated;
  }

  async updateSizeStatus(user: CurrentUser, id: string, isActive: boolean): Promise<SizeRecord> {
    const result = await this.repository.updateSizeStatus(user.shopId, id, isActive);
    if (!result) throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_NOT_FOUND);
    if (result.changed) {
      const newValues = sizeSnapshot(result.size);
      await this.audit.log({
        shopId: user.shopId,
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        action: 'STATUS_CHANGE',
        entityType: 'size',
        entityId: result.size.id,
        oldValues: { ...newValues, isActive: !isActive },
        newValues,
      });
    }
    return result.size;
  }

  async deleteSize(user: CurrentUser, id: string): Promise<{ deleted: true }> {
    const existing = await this.repository.findSizeById(user.shopId, id);
    if (!existing) throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_NOT_FOUND);
    if (await this.repository.isSizeInUse(id)) {
      throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_IN_USE);
    }
    if (!(await this.repository.deleteSize(user.shopId, id))) {
      throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_NOT_FOUND);
    }
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'DELETE',
      entityType: 'size',
      entityId: existing.id,
      oldValues: sizeSnapshot(existing),
    });
    return { deleted: true as const };
  }
}
