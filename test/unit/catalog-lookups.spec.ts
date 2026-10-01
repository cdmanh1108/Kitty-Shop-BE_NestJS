import { listLookups } from '@modules/catalog/infrastructure/catalog-lookups';
import type { PrismaService } from '@database/prisma/prisma.service';

describe('catalog active reference lookups', () => {
  it('requests only active Size and Color records and preserves backend Size ordering', async () => {
    const sizes = [
      { id: 'size-xl', code: 'XL', name: 'Extra Large', sortOrder: 1, isActive: true },
      { id: 'size-m', code: 'M', name: 'Medium', sortOrder: 2, isActive: true },
    ];
    const colors = [
      { id: 'color-blue', code: 'BLUE', name: 'Xanh', hexColor: null, isActive: true },
    ];
    const sizeFindMany = jest.fn().mockResolvedValue(sizes);
    const colorFindMany = jest.fn().mockResolvedValue(colors);
    const prisma = {
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
      category: { findMany: jest.fn().mockResolvedValue([]) },
      size: { findMany: sizeFindMany },
      color: { findMany: colorFindMany },
      shopLocation: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await listLookups(prisma as unknown as PrismaService, 'shop-1');

    expect(sizeFindMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', isActive: true },
      select: { id: true, code: true, name: true, sortOrder: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { code: 'asc' }],
    });
    expect(colorFindMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', isActive: true },
      select: { id: true, code: true, name: true, hexColor: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    expect(result.sizes).toEqual(sizes);
    expect(result.colors).toEqual(colors);
  });
});
