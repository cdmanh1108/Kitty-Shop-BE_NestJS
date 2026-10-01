import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogReferenceDataRepository } from '../domain/catalog-reference-data.repository';

export async function listLookups(
  prisma: PrismaService,
  shopId: string,
): ReturnType<CatalogReferenceDataRepository['listLookups']> {
  const [categories, sizes, colors, locations] = await prisma.$transaction([
    prisma.category.findMany({
      where: { shopId, isActive: true },
      select: {
        id: true,
        parentId: true,
        code: true,
        name: true,
        description: true,
        _count: { select: { products: { where: { shopId, archivedAt: null } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.size.findMany({
      where: { shopId, isActive: true },
      select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { code: 'asc' }],
    }),
    prisma.color.findMany({
      where: { shopId, isActive: true },
      select: { id: true, code: true, name: true, hexColor: true, isActive: true },
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
