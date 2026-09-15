import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import type { Request } from 'express';

@Injectable()
export class ShopResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveShopId(request?: Request): Promise<string> {
    const rawHeader = request?.headers?.['x-shop-code'];
    const headerShopCode = typeof rawHeader === 'string' ? rawHeader.trim() : undefined;
    const shopCode = headerShopCode || process.env.DEFAULT_SHOP_CODE || 'MAIN';

    const shop = await this.prisma.shop.findUnique({
      where: { code: shopCode },
      select: { id: true, status: true },
    });

    if (shop && shop.status === 'ACTIVE') {
      return shop.id;
    }

    const fallbackShop = await this.prisma.shop.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    if (!fallbackShop) {
      throw new NotFoundException('Không tìm thấy cửa hàng hoạt động trong hệ thống.');
    }

    return fallbackShop.id;
  }
}
