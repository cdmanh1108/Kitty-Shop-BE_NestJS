import { Prisma } from '@prisma/client';
import type { PrismaService } from '@database/prisma/prisma.service';
import { CATALOG_ERROR_CODE } from '@modules/catalog/domain/catalog-errors';
import {
  createColor,
  deleteColor,
  updateColor,
} from '@modules/catalog/infrastructure/color-commands';
import { createSize, deleteSize } from '@modules/catalog/infrastructure/size-commands';

function prismaError(code: 'P2002' | 'P2003'): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Constraint failed.', {
    code,
    clientVersion: '6.19.3',
  });
}

describe('Color and Size persistence error mapping', () => {
  it('maps a Color unique-constraint race to COLOR_CODE_ALREADY_EXISTS', async () => {
    const prisma = {
      color: { create: jest.fn().mockRejectedValue(prismaError('P2002')) },
    } as unknown as PrismaService;

    await expect(
      createColor(prisma, 'shop-1', { code: 'RED', name: 'Red', hexColor: null }),
    ).rejects.toMatchObject({ code: CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS });
  });

  it('maps a Color update unique-constraint race to COLOR_CODE_ALREADY_EXISTS', async () => {
    const prisma = {
      color: { updateMany: jest.fn().mockRejectedValue(prismaError('P2002')) },
    } as unknown as PrismaService;

    await expect(updateColor(prisma, 'shop-1', 'color-1', { code: 'RED' })).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_CODE_ALREADY_EXISTS,
    });
  });

  it('maps a Size unique-constraint race to SIZE_CODE_ALREADY_EXISTS', async () => {
    const prisma = {
      size: { create: jest.fn().mockRejectedValue(prismaError('P2002')) },
    } as unknown as PrismaService;

    await expect(
      createSize(prisma, 'shop-1', { code: 'M', name: 'Medium', sortOrder: 0 }),
    ).rejects.toMatchObject({ code: CATALOG_ERROR_CODE.SIZE_CODE_ALREADY_EXISTS });
  });

  it('maps a Color foreign-key race to COLOR_IN_USE', async () => {
    const prisma = {
      color: { deleteMany: jest.fn().mockRejectedValue(prismaError('P2003')) },
    } as unknown as PrismaService;

    await expect(deleteColor(prisma, 'shop-1', 'color-1')).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.COLOR_IN_USE,
    });
  });

  it('maps a Size foreign-key race to SIZE_IN_USE', async () => {
    const prisma = {
      size: { deleteMany: jest.fn().mockRejectedValue(prismaError('P2003')) },
    } as unknown as PrismaService;

    await expect(deleteSize(prisma, 'shop-1', 'size-1')).rejects.toMatchObject({
      code: CATALOG_ERROR_CODE.SIZE_IN_USE,
    });
  });
});
