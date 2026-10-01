import { Prisma } from '@prisma/client';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { CatalogColorRepository } from '../domain/catalog-color.repository';
import { CATALOG_ERROR_CODE, CatalogColorError } from '../domain/catalog-errors';

export function createColor(
  prisma: PrismaService,
  shopId: string,
  input: { code: string; name: string; hexColor: string | null },
): ReturnType<CatalogColorRepository['createColor']> {
  return prisma.color
    .create({ data: { shopId, ...input, isActive: true } })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS);
      }
      throw error;
    });
}

export function findColorById(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<CatalogColorRepository['findColorById']> {
  return prisma.color.findFirst({ where: { id, shopId } });
}

export function findColorByCode(
  prisma: PrismaService,
  shopId: string,
  code: string,
): ReturnType<CatalogColorRepository['findColorByCode']> {
  return prisma.color.findFirst({ where: { shopId, code } });
}

export async function updateColor(
  prisma: PrismaService,
  shopId: string,
  id: string,
  input: { code?: string; name?: string; hexColor?: string | null },
): ReturnType<CatalogColorRepository['updateColor']> {
  if (Object.values(input).every((value) => value === undefined)) {
    return findColorById(prisma, shopId, id);
  }
  try {
    const result = await prisma.color.updateMany({ where: { id, shopId }, data: input });
    if (!result.count) return null;
    return findColorById(prisma, shopId, id);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS);
    }
    throw error;
  }
}

export async function updateColorStatus(
  prisma: PrismaService,
  shopId: string,
  id: string,
  isActive: boolean,
): ReturnType<CatalogColorRepository['updateColorStatus']> {
  const result = await prisma.color.updateMany({
    where: { id, shopId, isActive: { not: isActive } },
    data: { isActive },
  });
  const color = await findColorById(prisma, shopId, id);
  if (!color) return null;
  return { color, changed: result.count > 0 };
}

export async function isColorInUse(prisma: PrismaService, id: string): Promise<boolean> {
  return (await prisma.productVariant.count({ where: { colorId: id } })) > 0;
}

export async function deleteColor(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<CatalogColorRepository['deleteColor']> {
  try {
    const result = await prisma.color.deleteMany({ where: { id, shopId } });
    return result.count === 1;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_IN_USE);
    }
    throw error;
  }
}
