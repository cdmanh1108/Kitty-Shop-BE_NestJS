import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import type { Request } from 'express';

@Injectable()
export class ShopResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveShopId(request?: Request): Promise<string> {
    const rawHeader = request?.headers?.['x-shop-code'];
    const headerShopCode = typeof rawHeader === 'string' ? rawHeader.trim() : undefined;

    if (headerShopCode) {
      const shop = await this.prisma.shop.findUnique({
        where: { code: headerShopCode },
        select: { id: true, status: true },
      });

      if (!shop || shop.status !== 'ACTIVE') {
        throw new NotFoundException('Không tìm thấy cửa hàng hoạt động trong hệ thống.');
      }

      if (request) {
        (request as Request & { resolvedShopId?: string }).resolvedShopId = shop.id;
      }
      return shop.id;
    }

    const defaultCode = process.env.DEFAULT_SHOP_CODE || 'MAIN';
    const defaultShop = await this.prisma.shop.findUnique({
      where: { code: defaultCode },
      select: { id: true, status: true },
    });

    if (defaultShop && defaultShop.status === 'ACTIVE') {
      if (request) {
        (request as Request & { resolvedShopId?: string }).resolvedShopId = defaultShop.id;
      }
      return defaultShop.id;
    }

    const fallbackShop = await this.prisma.shop.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    if (!fallbackShop) {
      throw new NotFoundException('Không tìm thấy cửa hàng hoạt động trong hệ thống.');
    }

    if (request) {
      (request as Request & { resolvedShopId?: string }).resolvedShopId = fallbackShop.id;
    }
    return fallbackShop.id;
  }
}
