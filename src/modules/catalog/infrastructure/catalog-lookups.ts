import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogRepository } from '../domain/catalog.repository';
import { CatalogInvariantError } from '../domain/catalog.repository';
import { Prisma } from '@prisma/client';

export async function listLookups(
  prisma: PrismaService,
  shopId: string,
): ReturnType<CatalogRepository['listLookups']> {
  const [categories, sizes, colors, locations] = await prisma.$transaction([
    prisma.category.findMany({
      where: { shopId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        _count: { select: { products: { where: { shopId, archivedAt: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.size.findMany({
      where: { shopId },
      select: { id: true, code: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.color.findMany({
      where: { shopId },
      select: { id: true, code: true, name: true, hexColor: true },
      orderBy: { name: 'asc' },
    }),
    prisma.shopLocation.findMany({
      where: { shopId, isActive: true },
      select: { id: true, code: true, name: true, isPrimary: true },
      orderBy: { isPrimary: 'desc' },
    }),
  ]);
  return {
    categories: categories.map(({ _count, ...category }) => ({
      ...category,
      productCount: _count.products,
    })),
    sizes,
    colors,
    locations,
  };
}
export async function createCategory(
  prisma: PrismaService,
  shopId: string,
  input: {
    code: string;
    name: string;
    description?: string;
    status: 'ACTIVE' | 'INACTIVE';
    sortOrder: number;
  },
): ReturnType<CatalogRepository['createCategory']> {
  if (await prisma.category.count({ where: { shopId, code: input.code } })) {
    throw new CatalogInvariantError('CATEGORY_CODE_ALREADY_EXISTS');
  }
  let created;
  try {
    created = await prisma.category.create({
      data: {
        shopId,
        code: input.code,
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder,
        isActive: input.status === 'ACTIVE',
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new CatalogInvariantError('CATEGORY_CODE_ALREADY_EXISTS');
    throw error;
  }
  const { isActive, ...safeCreated } = created;
  return { ...safeCreated, status: isActive ? 'ACTIVE' : 'INACTIVE', productCount: 0 };
}

export async function listCategories(
  prisma: PrismaService,
  input: {
    shopId: string;
    page: number;
    limit: number;
    search?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  },
): ReturnType<CatalogRepository['listCategories']> {
  const where = {
    shopId: input.shopId,
    ...(input.status ? { isActive: input.status === 'ACTIVE' } : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: 'insensitive' as const } },
            { code: { contains: input.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { products: { where: { shopId: input.shopId, archivedAt: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.category.count({ where }),
  ]);
  return {
    items: items.map(({ isActive, _count, ...item }) => ({
      ...item,
      status: isActive ? 'ACTIVE' : 'INACTIVE',
      productCount: _count.products,
    })),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export function categoryOptions(
  prisma: PrismaService,
  shopId: string,
  includeInactive = false,
): ReturnType<CatalogRepository['categoryOptions']> {
  return prisma.category
    .findMany({
      where: { shopId, ...(!includeInactive ? { isActive: true } : {}) },
      select: { id: true, code: true, name: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    .then((items) =>
      items.map(({ isActive, ...item }) => ({
        ...item,
        status: isActive ? 'ACTIVE' : 'INACTIVE',
      })),
    );
}

export async function updateCategory(
  prisma: PrismaService,
  shopId: string,
  id: string,
  input: {
    name?: string;
    description?: string | null;
    status?: 'ACTIVE' | 'INACTIVE';
    sortOrder?: number;
  },
): ReturnType<CatalogRepository['updateCategory']> {
  const result = await prisma.category.updateMany({
    where: { id, shopId },
    data: {
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder,
      ...(input.status ? { isActive: input.status === 'ACTIVE' } : {}),
    },
  });
  if (!result.count) return null;
  const updated = await prisma.category.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      sortOrder: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
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
): ReturnType<CatalogRepository['deleteCategory']> {
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
export function createSize(
  prisma: PrismaService,
  shopId: string,
  input: { code: string; name: string; sortOrder: number },
): ReturnType<CatalogRepository['createSize']> {
  return prisma.size.create({ data: { shopId, ...input } });
}
export function createColor(
  prisma: PrismaService,
  shopId: string,
  input: { code: string; name: string; hexColor?: string },
): ReturnType<CatalogRepository['createColor']> {
  return prisma.color.create({ data: { shopId, ...input } });
}
