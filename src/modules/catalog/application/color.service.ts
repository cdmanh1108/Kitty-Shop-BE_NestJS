import type { CurrentUser } from '@common/types/current-user';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/public/audit-contracts';
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
import type { ColorPage } from '../domain/catalog.models';
import type { ColorRecord } from '../domain/catalog.records';
import type { ColorListQuery, CreateColorInput, UpdateColorInput } from './catalog.contracts';

function colorSnapshot(color: ColorRecord) {
  return {
    id: color.id,
    code: color.code,
    name: color.name,
    hexColor: color.hexColor,
    isActive: color.isActive,
  };
}

@Injectable()
export class ColorService {
  constructor(
    @Inject(CATALOG_COLOR_REPOSITORY) private readonly repository: CatalogColorRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  listColors(user: CurrentUser, query: ColorListQuery): Promise<ColorPage> {
    return this.repository.listColors({
      shopId: user.shopId,
      page: query.page,
      limit: query.limit,
      q: query.q?.trim() || undefined,
      status: query.status ?? 'ALL',
    });
  }

  async getColor(user: CurrentUser, id: string): Promise<ColorRecord> {
    const color = await this.repository.findColorById(user.shopId, id);
    if (!color) throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_NOT_FOUND);
    return color;
  }

  async createColor(user: CurrentUser, input: CreateColorInput): Promise<ColorRecord> {
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

  async updateColor(user: CurrentUser, id: string, input: UpdateColorInput): Promise<ColorRecord> {
    const existing = await this.repository.findColorById(user.shopId, id);
    if (!existing) throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_NOT_FOUND);

    const code = input.code === undefined ? undefined : normalizeColorCode(input.code);
    if (code !== undefined) {
      const duplicate = await this.repository.findColorByCode(user.shopId, code);
      if (duplicate && duplicate.id !== id) {
        throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS);
      }
    }
    const name = input.name === undefined ? undefined : normalizeColorName(input.name);
    const hexColor = input.hexColor === undefined ? undefined : normalizeHexColor(input.hexColor);
    const changes = {
      ...(code !== undefined ? { code } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(hexColor !== undefined ? { hexColor } : {}),
    };
    if (Object.keys(changes).length === 0) return existing;

    const updated = await this.repository.updateColor(user.shopId, id, changes);
    if (!updated) throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_NOT_FOUND);
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'UPDATE',
      entityType: 'color',
      entityId: updated.id,
      oldValues: colorSnapshot(existing),
      newValues: colorSnapshot(updated),
    });
    return updated;
  }

  async updateColorStatus(user: CurrentUser, id: string, isActive: boolean): Promise<ColorRecord> {
    const result = await this.repository.updateColorStatus(user.shopId, id, isActive);
    if (!result) throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_NOT_FOUND);
    if (result.changed) {
      const newValues = colorSnapshot(result.color);
      await this.audit.log({
        shopId: user.shopId,
        actorUserId: user.userId,
        actorMemberId: user.memberId,
        action: 'STATUS_CHANGE',
        entityType: 'color',
        entityId: result.color.id,
        oldValues: { ...newValues, isActive: !isActive },
        newValues,
      });
    }
    return result.color;
  }

  async deleteColor(user: CurrentUser, id: string): Promise<{ deleted: true }> {
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
      oldValues: colorSnapshot(existing),
    });
    return { deleted: true as const };
  }
}
