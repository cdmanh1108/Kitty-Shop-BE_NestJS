import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogRepository } from '../domain/catalog.repository';
import { CatalogInvariantError } from '../domain/catalog.repository';

export async function listLookups(
  prisma: PrismaService,
  shopId: string,
): ReturnType<CatalogRepository['listLookups']> {
  const [categories, sizes, colors, locations] = await prisma.$transaction([
    prisma.category.findMany({
      where: { shopId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.size.findMany({
      where: { shopId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.color.findMany({ where: { shopId }, orderBy: { name: 'asc' } }),
    prisma.shopLocation.findMany({
      where: { shopId, isActive: true },
      orderBy: { isPrimary: 'desc' },
    }),
  ]);
  return { categories, sizes, colors, locations };
}
export async function createCategory(
  prisma: PrismaService,
  shopId: string,
  input: { code: string; name: string; parentId?: string },
): ReturnType<CatalogRepository['createCategory']> {
  if (input.parentId) {
    const parent = await prisma.category.count({
      where: { id: input.parentId, shopId, isActive: true },
    });
    if (!parent)
      throw new CatalogInvariantError(
        'Parent category does not belong to this shop or is inactive',
      );
  }
  return prisma.category.create({ data: { shopId, ...input } });
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
