import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type { CatalogSizeRepository } from '../domain/catalog-size.repository';

export async function listSizes(
  prisma: PrismaService,
  input: Parameters<CatalogSizeRepository['listSizes']>[0],
): ReturnType<CatalogSizeRepository['listSizes']> {
  const where: Prisma.SizeWhereInput = {
    shopId: input.shopId,
    ...(input.status === 'ACTIVE' ? { isActive: true } : {}),
    ...(input.status === 'INACTIVE' ? { isActive: false } : {}),
    ...(input.q
      ? {
          OR: [
            { code: { contains: input.q, mode: 'insensitive' } },
            { name: { contains: input.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.size.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { code: 'asc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.size.count({ where }),
  ]);
  return { items, meta: paginateMeta(input.page, input.limit, total) };
}
