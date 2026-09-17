import { NotFoundException } from '@nestjs/common';
import { ShopResolver } from '../../src/common/tenant/shop-resolver';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import type { Request } from 'express';

describe('ShopResolver', () => {
  let resolver: ShopResolver;
  let prismaMock: {
    shop: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  const originalEnv = process.env.DEFAULT_SHOP_CODE;

  beforeEach(() => {
    prismaMock = {
      shop: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    resolver = new ShopResolver(prismaMock as unknown as PrismaService);
    process.env.DEFAULT_SHOP_CODE = 'MAIN';
  });

  afterAll(() => {
    process.env.DEFAULT_SHOP_CODE = originalEnv;
  });

  describe('Explicit tenant header (x-shop-code)', () => {
    it('resolves active shop id when valid shop code is supplied', async () => {
      prismaMock.shop.findUnique.mockResolvedValue({
        id: 'shop-uuid-1',
        status: 'ACTIVE',
      });

      const req = { headers: { 'x-shop-code': 'SHOP_HCM' } } as unknown as Request;
      const result = await resolver.resolveShopId(req);

      expect(result).toBe('shop-uuid-1');
      expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({
        where: { code: 'SHOP_HCM' },
        select: { id: true, status: true },
      });
      expect(prismaMock.shop.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException without fallback when explicit shop code does not exist', async () => {
      prismaMock.shop.findUnique.mockResolvedValue(null);
      prismaMock.shop.findFirst.mockResolvedValue({ id: 'fallback-shop-uuid' });

      const req = { headers: { 'x-shop-code': 'INVALID_SHOP' } } as unknown as Request;

      await expect(resolver.resolveShopId(req)).rejects.toThrow(
        new NotFoundException('Không tìm thấy cửa hàng hoạt động trong hệ thống.'),
      );

      expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({
        where: { code: 'INVALID_SHOP' },
        select: { id: true, status: true },
      });
      expect(prismaMock.shop.findFirst).not.toHaveBeenCalled();
    });

    it('throws NotFoundException without fallback when explicit shop is inactive or archived', async () => {
      prismaMock.shop.findUnique.mockResolvedValue({
        id: 'inactive-shop-uuid',
        status: 'INACTIVE',
      });
      prismaMock.shop.findFirst.mockResolvedValue({ id: 'fallback-shop-uuid' });

      const req = { headers: { 'x-shop-code': 'DISABLED_SHOP' } } as unknown as Request;

      await expect(resolver.resolveShopId(req)).rejects.toThrow(
        new NotFoundException('Không tìm thấy cửa hàng hoạt động trong hệ thống.'),
      );

      expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({
        where: { code: 'DISABLED_SHOP' },
        select: { id: true, status: true },
      });
      expect(prismaMock.shop.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('Missing tenant header', () => {
    it('uses DEFAULT_SHOP_CODE when no header is supplied and default shop is active', async () => {
      prismaMock.shop.findUnique.mockResolvedValue({
        id: 'default-shop-uuid',
        status: 'ACTIVE',
      });

      const req = { headers: {} } as unknown as Request;
      const result = await resolver.resolveShopId(req);

      expect(result).toBe('default-shop-uuid');
      expect(prismaMock.shop.findUnique).toHaveBeenCalledWith({
        where: { code: 'MAIN' },
        select: { id: true, status: true },
      });
      expect(prismaMock.shop.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to first active shop when default shop is inactive or not found', async () => {
      prismaMock.shop.findUnique.mockResolvedValue(null);
      prismaMock.shop.findFirst.mockResolvedValue({ id: 'fallback-shop-uuid' });

      const req = undefined;
      const result = await resolver.resolveShopId(req);

      expect(result).toBe('fallback-shop-uuid');
      expect(prismaMock.shop.findFirst).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });
    });

    it('throws NotFoundException when no header is supplied and no active shop exists in database', async () => {
      prismaMock.shop.findUnique.mockResolvedValue(null);
      prismaMock.shop.findFirst.mockResolvedValue(null);

      const req = { headers: {} } as unknown as Request;

      await expect(resolver.resolveShopId(req)).rejects.toThrow(
        new NotFoundException('Không tìm thấy cửa hàng hoạt động trong hệ thống.'),
      );
    });
  });
});
