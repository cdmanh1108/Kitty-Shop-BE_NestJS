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
import type { CreateSizeInput } from './catalog.contracts';

@Injectable()
export class SizeService {
  constructor(
    @Inject(CATALOG_SIZE_REPOSITORY) private readonly repository: CatalogSizeRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async createSize(user: CurrentUser, input: CreateSizeInput) {
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

  async deleteSize(user: CurrentUser, id: string) {
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
      oldValues: {
        id: existing.id,
        code: existing.code,
        name: existing.name,
        sortOrder: existing.sortOrder,
        isActive: existing.isActive,
      },
    });
    return { deleted: true as const };
  }
}
