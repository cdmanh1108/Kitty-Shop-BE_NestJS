import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogRepository } from '../domain/catalog.repository';

export async function listProducts(
  prisma: PrismaService,
  input: Parameters<CatalogRepository['listProducts']>[0],
): ReturnType<CatalogRepository['listProducts']> {
  const where = {
    shopId: input.shopId,
    archivedAt: null,
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: 'insensitive' as const } },
            { code: { contains: input.search, mode: 'insensitive' as const } },
            {
              variants: {
                some: {
                  inventoryItems: {
                    some: { sku: { contains: input.search, mode: 'insensitive' as const } },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: {
        category: true,
        media: { where: { isPrimary: true }, take: 1 },
        variants: { include: { _count: { select: { inventoryItems: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.product.count({ where }),
  ]);
  return { items, meta: paginateMeta(input.page, input.limit, total) };
}
export function findProduct(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<CatalogRepository['findProduct']> {
  return prisma.product.findFirst({
    where: { id, shopId, archivedAt: null },
    include: {
      category: true,
      media: { orderBy: { sortOrder: 'asc' } },
      rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
      variants: {
        include: {
          size: true,
          color: true,
          rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
          inventoryItems: { where: { isActive: true }, orderBy: { sku: 'asc' } },
        },
      },
    },
  });
}
