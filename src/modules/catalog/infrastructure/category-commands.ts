import { Prisma } from '@prisma/client';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogCategoryRepository } from '../domain/catalog-category.repository';
import {
  CatalogCategoryCodeAlreadyExistsError,
  CatalogCategoryInvalidParentError,
} from '../domain/catalog-errors';

export async function createCategory(
  prisma: PrismaService,
  shopId: string,
  input: {
    parentId?: string | null;
    code: string;
    name: string;
    description?: string;
    status: 'ACTIVE' | 'INACTIVE';
    sortOrder: number;
  },
): ReturnType<CatalogCategoryRepository['createCategory']> {
  if (await prisma.category.count({ where: { shopId, code: input.code } })) {
    throw new CatalogCategoryCodeAlreadyExistsError();
  }
  if (input.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: input.parentId, shopId },
      select: { id: true },
    });
    if (!parent) {
      throw new CatalogCategoryInvalidParentError('Danh mục cha không tồn tại.');
    }
  }
  let created;
  try {
    created = await prisma.category.create({
      data: {
        shopId,
        parentId: input.parentId || null,
        code: input.code,
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder,
        isActive: input.status === 'ACTIVE',
      },
      select: {
        id: true,
        parentId: true,
        code: true,
        name: true,
        description: true,
        sortOrder: true,
        isActive: true,
        parent: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new CatalogCategoryCodeAlreadyExistsError();
    throw error;
  }
  const { isActive, ...safeCreated } = created;
  return { ...safeCreated, status: isActive ? 'ACTIVE' : 'INACTIVE', productCount: 0 };
}

export async function updateCategory(
  prisma: PrismaService,
  shopId: string,
  id: string,
  input: {
    parentId?: string | null;
    code?: string;
    name?: string;
    description?: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
    sortOrder?: number;
  },
): ReturnType<CatalogCategoryRepository['updateCategory']> {
  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) {
      throw new CatalogCategoryInvalidParentError(
        'Danh mục không thể chọn chính nó làm danh mục cha.',
      );
    }
    const parent = await prisma.category.findFirst({
      where: { id: input.parentId, shopId },
      select: { id: true },
    });
    if (!parent) {
      throw new CatalogCategoryInvalidParentError('Danh mục cha không tồn tại.');
    }
  }

  const result = await prisma.category
    .updateMany({
      where: { id, shopId },
      data: {
        ...(input.parentId !== undefined ? { parentId: input.parentId || null } : {}),
        code: input.code,
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder,
        ...(input.status ? { isActive: input.status === 'ACTIVE' } : {}),
      },
    })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new CatalogCategoryCodeAlreadyExistsError();
      throw error;
    });
  if (!result.count) return null;
  const updated = await prisma.category.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      parentId: true,
      code: true,
      name: true,
      description: true,
      sortOrder: true,
      isActive: true,
      parent: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      _count: { select: { products: { where: { shopId, archivedAt: null } } } },
    },
  });
  if (!updated) return null;
  const { isActive, _count, ...safeUpdated } = updated;
  return {
    ...safeUpdated,
    status: isActive ? 'ACTIVE' : 'INACTIVE',
    productCount: _count.products,
  };
}

export async function deleteCategory(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<CatalogCategoryRepository['deleteCategory']> {
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({ where: { id, shopId }, select: { id: true } });
      if (!category) return 'not-found';
      if (await tx.product.count({ where: { shopId, categoryId: id } })) return 'in-use';
      await tx.category.deleteMany({ where: { id, shopId } });
      return 'deleted';
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return 'in-use';
    }
    throw error;
  }
}
