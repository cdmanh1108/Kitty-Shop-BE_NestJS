import type { CurrentUser } from '@common/types/current-user';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import {
  CATALOG_COLOR_REPOSITORY,
  type CatalogColorRepository,
} from '../domain/catalog-color.repository';
import { CATALOG_ERROR_CODE, CatalogColorError } from '../domain/catalog-errors';
import {
  normalizeColorCode,
  normalizeColorName,
  normalizeHexColor,
} from '../domain/catalog-master-data.rules';
import type { CreateColorInput } from './catalog.contracts';

@Injectable()
export class ColorService {
  constructor(
    @Inject(CATALOG_COLOR_REPOSITORY) private readonly repository: CatalogColorRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async createColor(user: CurrentUser, input: CreateColorInput) {
    const normalized = {
      code: normalizeColorCode(input.code),
      name: normalizeColorName(input.name),
      hexColor: normalizeHexColor(input.hexColor),
    };
    if (await this.repository.findColorByCode(user.shopId, normalized.code)) {
      throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS);
    }
    const created = await this.repository.createColor(user.shopId, normalized);
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'color',
      entityId: created.id,
      newValues: {
        id: created.id,
        code: created.code,
        name: created.name,
        hexColor: created.hexColor,
        isActive: created.isActive,
      },
    });
    return created;
  }

  async deleteColor(user: CurrentUser, id: string) {
    const existing = await this.repository.findColorById(user.shopId, id);
    if (!existing) throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_NOT_FOUND);
    if (await this.repository.isColorInUse(id)) {
      throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_IN_USE);
    }
    if (!(await this.repository.deleteColor(user.shopId, id))) {
      throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_NOT_FOUND);
    }
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'DELETE',
      entityType: 'color',
      entityId: existing.id,
      oldValues: {
        id: existing.id,
        code: existing.code,
        name: existing.name,
        hexColor: existing.hexColor,
        isActive: existing.isActive,
      },
    });
    return { deleted: true as const };
  }
}
