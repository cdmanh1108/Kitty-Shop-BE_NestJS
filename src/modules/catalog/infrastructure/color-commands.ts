import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogColorRepository } from '../domain/catalog-color.repository';

export function createColor(
  prisma: PrismaService,
  shopId: string,
  input: { code: string; name: string; hexColor?: string },
): ReturnType<CatalogColorRepository['createColor']> {
  return prisma.color.create({ data: { shopId, ...input } });
}
