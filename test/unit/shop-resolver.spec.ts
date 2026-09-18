import { NotFoundException } from '@nestjs/common';
import { ShopResolver } from '../../src/common/tenant/shop-resolver';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import type { Request } from 'express';

describe('ShopResolver', () => {
  let prismaMock: { shop: { findUnique: jest.Mock } };
  let configuredDefault: string | undefined;
  let resolver: ShopResolver;

  beforeEach(() => {
    configuredDefault = 'shop-a';
    prismaMock = { shop: { findUnique: jest.fn() } };
    resolver = new ShopResolver(
      prismaMock as unknown as PrismaService,
      { get: () => configuredDefault },
    );
  });

  const requestWith = (shopCode?: string): Request =>
    ({ headers: shopCode === undefined ? {} : { 'x-shop-code': shopCode } }) as unknown as Request;

  it('resolves an explicit active shop exactly and records the resolved context', async () => {
    prismaMock.shop.findUnique.mockResolvedValue({ id: 'shop-a-id', status: 'ACTIVE' });
    const request = requestWith('  shop-a  ');

    await expect(resolver.resolveShopId(request)).resolves.toBe('shop-a-id');
    expect(prismaMock.shop.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({ where: { code: 'shop-a' }, select: { id: true, status: true } });
    expect((request as Request & { resolvedShopId?: string }).resolvedShopId).toBe('shop-a-id');
  });

  it('fails for an explicit unknown shop and never queries the configured default', async () => {
    prismaMock.shop.findUnique.mockResolvedValue(null);

    await expect(resolver.resolveShopId(requestWith('missing-shop'))).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({ where: { code: 'missing-shop' }, select: { id: true, status: true } });
  });

  it('fails for an explicit inactive shop and never selects another active tenant', async () => {
    prismaMock.shop.findUnique.mockResolvedValue({ id: 'shop-a-id', status: 'INACTIVE' });

    await expect(resolver.resolveShopId(requestWith('shop-a'))).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledTimes(1);
  });

  it('uses the configured active default only when the request did not specify a shop', async () => {
    configuredDefault = 'shop-b';
    prismaMock.shop.findUnique.mockResolvedValue({ id: 'shop-b-id', status: 'ACTIVE' });

    await expect(resolver.resolveShopId(requestWith())).resolves.toBe('shop-b-id');
    expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({ where: { code: 'shop-b' }, select: { id: true, status: true } });
  });

  it('fails closed when the configured default is unknown despite other active shops', async () => {
    configuredDefault = 'missing-shop';
    prismaMock.shop.findUnique.mockResolvedValue(null);

    await expect(resolver.resolveShopId(requestWith())).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({ where: { code: 'missing-shop' }, select: { id: true, status: true } });
  });

  it('fails closed for an inactive configured default and for no configured default', async () => {
    prismaMock.shop.findUnique.mockResolvedValue({ id: 'shop-a-id', status: 'INACTIVE' });
    await expect(resolver.resolveShopId(requestWith())).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.shop.findUnique).toHaveBeenCalledTimes(1);

    configuredDefault = undefined;
    prismaMock.shop.findUnique.mockClear();
    await expect(resolver.resolveShopId(requestWith())).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.shop.findUnique).not.toHaveBeenCalled();
  });

  it('treats an empty explicit header as invalid instead of using the default', async () => {
    await expect(resolver.resolveShopId(requestWith('   '))).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.shop.findUnique).not.toHaveBeenCalled();
  });
});
