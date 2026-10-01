import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_CATEGORY_REPOSITORY,
  type CatalogCategoryRepository,
} from '../domain/catalog-category.repository';
import type {
  CategoryListQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './catalog.contracts';
import { CatalogInvariantError } from '../domain/catalog-errors';
import { CategoryInUseError } from './catalog-application.errors';

@Injectable()
export class CategoryService {
  constructor(
    @Inject(CATALOG_CATEGORY_REPOSITORY) private readonly repository: CatalogCategoryRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

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
    const created = await this.repository.createCategory(user.shopId, {
      parentId: input.parentId || null,
      code,
      name,
      description: input.description?.trim() || undefined,
      status: input.status ?? 'ACTIVE',
      sortOrder: input.sortOrder ?? 0,
    });
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'category',
      entityId: created.id,
      newValues: {
        parentId: input.parentId || null,
        code,
        name,
        status: input.status ?? 'ACTIVE',
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return created;
  }

  async updateCategory(user: CurrentUser, id: string, input: UpdateCategoryInput) {
    const code = input.code?.trim() ? input.code.trim().toUpperCase() : undefined;
    const parentId = input.parentId === undefined ? undefined : input.parentId || null;
    const updated = await this.repository.updateCategory(user.shopId, id, {
      ...input,
      parentId,
      code,
      name: input.name?.trim(),
      description: input.description === null ? null : input.description?.trim() || undefined,
    });
    if (!updated) throw new CatalogInvariantError('CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục.');
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
      throw new CatalogInvariantError('CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục.');
    if (result === 'in-use') throw new CategoryInUseError();
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
}
