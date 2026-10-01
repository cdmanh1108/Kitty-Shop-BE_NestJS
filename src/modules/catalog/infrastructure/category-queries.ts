import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogCategoryRepository } from '../domain/catalog-category.repository';

export async function listCategories(
  prisma: PrismaService,
  input: {
    shopId: string;
    page: number;
    limit: number;
    search?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  },
): ReturnType<CatalogCategoryRepository['listCategories']> {
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
): ReturnType<CatalogCategoryRepository['categoryOptions']> {
  return prisma.category
    .findMany({
      where: { shopId, ...(!includeInactive ? { isActive: true } : {}) },
      select: { id: true, parentId: true, code: true, name: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    .then((items) =>
      items.map(({ isActive, ...item }) => ({
        ...item,
        status: isActive ? 'ACTIVE' : 'INACTIVE',
      })),
    );
}
