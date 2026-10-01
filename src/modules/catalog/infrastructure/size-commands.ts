import { Prisma } from '@prisma/client';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogSizeRepository } from '../domain/catalog-size.repository';
import { CATALOG_ERROR_CODE, CatalogSizeError } from '../domain/catalog-errors';

export function createSize(
  prisma: PrismaService,
  shopId: string,
  input: { code: string; name: string; sortOrder: number },
): ReturnType<CatalogSizeRepository['createSize']> {
  return prisma.size
    .create({ data: { shopId, ...input, isActive: true } })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_CODE_ALREADY_EXISTS);
      }
      throw error;
    });
}

export function findSizeById(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<CatalogSizeRepository['findSizeById']> {
  return prisma.size.findFirst({ where: { id, shopId } });
}

export function findSizeByCode(
  prisma: PrismaService,
  shopId: string,
  code: string,
): ReturnType<CatalogSizeRepository['findSizeByCode']> {
  return prisma.size.findFirst({ where: { shopId, code } });
}

export async function isSizeInUse(prisma: PrismaService, id: string): Promise<boolean> {
  return (await prisma.productVariant.count({ where: { sizeId: id } })) > 0;
}

export async function deleteSize(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<CatalogSizeRepository['deleteSize']> {
  try {
    const result = await prisma.size.deleteMany({ where: { id, shopId } });
    return result.count === 1;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_IN_USE);
    }
    throw error;
  }
}
