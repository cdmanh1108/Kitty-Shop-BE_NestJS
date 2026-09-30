import { ConflictException } from '@nestjs/common';
import type { AuditPort } from '@modules/audit/domain/audit.port';
import type { CurrentUser } from '@common/types/current-user';
import type { CatalogCategoryRepository } from '@modules/catalog/domain/catalog-category.repository';
import { CategoryService } from '@modules/catalog/application/category.service';

describe('CategoryService', () => {
  const user: CurrentUser = {
    userId: 'user-1',
    memberId: 'member-1',
    shopId: 'shop-1',
    email: 'admin@kitty.local',
    fullName: 'Admin',
    permissions: ['catalog.view', 'catalog.manage'],
  };
  let repository: jest.Mocked<CatalogCategoryRepository>;
  let audit: AuditPort;
  let auditLogMock: jest.MockedFunction<AuditPort['log']>;
  let createCategoryMock: jest.MockedFunction<CatalogCategoryRepository['createCategory']>;
  let service: CategoryService;

  beforeEach(() => {
    createCategoryMock = jest.fn();
    repository = {
      listCategories: jest.fn(),
      categoryOptions: jest.fn(),
      createCategory: createCategoryMock,
      updateCategory: jest.fn(),
      deleteCategory: jest.fn(),
    };
    auditLogMock = jest.fn().mockResolvedValue(undefined);
    audit = { log: auditLogMock };
    service = new CategoryService(repository, audit);
  });

  it('normalizes new category data, scopes it to the user shop, and records the audit', async () => {
    const created = {
      id: 'category-1',
      parentId: null,
      code: 'AO_DAM',
      name: 'Áo Đầm',
      description: 'Trang phục',
      sortOrder: 0,
      status: 'ACTIVE' as const,
      productCount: 0,
      parent: null,
    };
    repository.createCategory.mockResolvedValue(created);

    await expect(
      service.createCategory(user, {
        name: ' Áo Đầm ',
        description: ' Trang phục ',
      }),
    ).resolves.toBe(created);

    expect(createCategoryMock).toHaveBeenCalledWith('shop-1', {
      parentId: null,
      code: 'AO_DAM',
      name: 'Áo Đầm',
      description: 'Trang phục',
      status: 'ACTIVE',
      sortOrder: 0,
    });
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        actorUserId: 'user-1',
        actorMemberId: 'member-1',
        action: 'CREATE',
        entityType: 'category',
        entityId: 'category-1',
      }),
    );
  });

  it('maps an in-use category delete to conflict and does not audit a failed mutation', async () => {
    repository.deleteCategory.mockResolvedValue('in-use');

    await expect(service.deleteCategory(user, 'category-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(auditLogMock).not.toHaveBeenCalled();
  });
});
