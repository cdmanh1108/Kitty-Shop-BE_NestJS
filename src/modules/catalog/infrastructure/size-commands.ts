import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogSizeRepository } from '../domain/catalog-size.repository';

export function createSize(
  prisma: PrismaService,
  shopId: string,
  input: { code: string; name: string; sortOrder: number },
): ReturnType<CatalogSizeRepository['createSize']> {
  return prisma.size.create({ data: { shopId, ...input } });
}
