import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';

@Injectable()
export class ShopResolver {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A deployment runs exactly one shop. Reading at most two records proves the
   * invariant without silently choosing an arbitrary first shop.
   */
  async resolveShopId(): Promise<string> {
    const shops = await this.prisma.shop.findMany({
      take: 2,
      select: { id: true, status: true },
    });

    if (shops.length === 0) {
      throw new ServiceUnavailableException(
        'Hệ thống chưa có cửa hàng nào. Cần cấu hình chính xác một cửa hàng trước khi vận hành.',
      );
    }
    if (shops.length > 1) {
      throw new ServiceUnavailableException(
        'Hệ thống có nhiều cửa hàng. Deployment single-shop yêu cầu chính xác một cửa hàng.',
      );
    }
    const shop = shops[0]!;
    if (shop.status !== 'ACTIVE') {
      throw new ServiceUnavailableException('Cửa hàng duy nhất của hệ thống đang không hoạt động.');
    }

    return shop.id;
  }
}
