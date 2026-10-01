import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import type { CatalogColorRepository } from '../domain/catalog-color.repository';

export async function listColors(
  prisma: PrismaService,
  input: Parameters<CatalogColorRepository['listColors']>[0],
): ReturnType<CatalogColorRepository['listColors']> {
  const where: Prisma.ColorWhereInput = {
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
    prisma.color.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        hexColor: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.color.count({ where }),
  ]);
  return { items, meta: paginateMeta(input.page, input.limit, total) };
}
