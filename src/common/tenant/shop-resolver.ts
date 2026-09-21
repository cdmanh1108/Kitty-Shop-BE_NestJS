import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import { PrismaService } from '@database/prisma/prisma.service';
import type { Request } from 'express';

type ShopResolverConfig = Pick<ConfigService<AppConfiguration, true>, 'get'>;

@Injectable()
export class ShopResolver {
  private readonly logger = new Logger(ShopResolver.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ShopResolverConfig,
  ) {}

  async resolveShopId(request?: Request): Promise<string> {
    const rawHeader = request?.headers?.['x-shop-code'];
    if (rawHeader !== undefined) {
      const explicitCode = this.normalizeShopCode(rawHeader);
      if (!explicitCode) throw this.unresolvedShopError();
      return this.resolveShopByCode(explicitCode, request);
    }

    const defaultCode = this.normalizeShopCode(this.config.get('defaultShopCode', { infer: true }));
    if (!defaultCode) {
      this.logDefaultResolutionFailure(undefined, request);
      throw this.unresolvedShopError();
    }

    try {
      return await this.resolveShopByCode(defaultCode, request);
    } catch (error) {
      if (error instanceof NotFoundException)
        this.logDefaultResolutionFailure(defaultCode, request);
      throw error;
    }
  }

  private async resolveShopByCode(code: string, request?: Request): Promise<string> {
    const shop = await this.prisma.shop.findUnique({
      where: { code },
      select: { id: true, status: true },
    });
    if (!shop || shop.status !== 'ACTIVE') throw this.unresolvedShopError();

    if (request) (request as Request & { resolvedShopId?: string }).resolvedShopId = shop.id;
    return shop.id;
  }

  private normalizeShopCode(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const code = value.trim();
    return code && /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : undefined;
  }

  private unresolvedShopError(): NotFoundException {
    return new NotFoundException('Không tìm thấy cửa hàng hoạt động trong hệ thống.');
  }

  private logDefaultResolutionFailure(
    defaultShopCode: string | undefined,
    request?: Request,
  ): void {
    this.logger.error({
      event: 'tenant.default_shop_unresolved',
      errorCode: 'DEFAULT_SHOP_UNRESOLVED',
      configuredShopCode: defaultShopCode,
      requestId: request?.requestId,
    });
  }
}
