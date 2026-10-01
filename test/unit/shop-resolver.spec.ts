import { ServiceUnavailableException } from '@nestjs/common';
import { ShopResolver } from '../../src/common/shop-context/shop-resolver';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

describe('ShopResolver single-shop invariant', () => {
  let prismaMock: { shop: { findMany: jest.Mock } };
  let resolver: ShopResolver;

  beforeEach(() => {
    prismaMock = { shop: { findMany: jest.fn() } };
    resolver = new ShopResolver(prismaMock as unknown as PrismaService);
  });

  it('returns the only active shop', async () => {
    prismaMock.shop.findMany.mockResolvedValue([{ id: 'shop-only', status: 'ACTIVE' }]);

    await expect(resolver.resolveShopId()).resolves.toBe('shop-only');
    expect(prismaMock.shop.findMany).toHaveBeenCalledWith({
      take: 2,
      select: { id: true, status: true },
    });
  });

  it('fails clearly when no shop exists', async () => {
    prismaMock.shop.findMany.mockResolvedValue([]);

    await expect(resolver.resolveShopId()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(resolver.resolveShopId()).rejects.toThrow('chưa có cửa hàng nào');
  });

  it('fails clearly when multiple shops exist instead of choosing one', async () => {
    prismaMock.shop.findMany.mockResolvedValue([
      { id: 'shop-a', status: 'ACTIVE' },
      { id: 'shop-b', status: 'ACTIVE' },
    ]);

    await expect(resolver.resolveShopId()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(resolver.resolveShopId()).rejects.toThrow('nhiều cửa hàng');
  });

  it('fails when the only configured shop is inactive', async () => {
    prismaMock.shop.findMany.mockResolvedValue([{ id: 'shop-only', status: 'INACTIVE' }]);

    await expect(resolver.resolveShopId()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
