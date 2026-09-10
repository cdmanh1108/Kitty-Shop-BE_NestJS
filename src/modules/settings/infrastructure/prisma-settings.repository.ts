import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import type { SettingsRepository } from '../domain/settings.repository';

@Injectable()
export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(shopId: string) {
    return this.prisma.appSetting.findMany({ where: { shopId }, orderBy: { key: 'asc' } });
  }

  upsert(input: { shopId: string; key: string; value: unknown; description?: string; updatedBy: string }) {
    const value = JSON.parse(JSON.stringify(input.value)) as Prisma.InputJsonValue;
    return this.prisma.appSetting.upsert({
      where: { shopId_key: { shopId: input.shopId, key: input.key } },
      create: { shopId: input.shopId, key: input.key, value, description: input.description, updatedBy: input.updatedBy },
      update: { value, description: input.description, updatedBy: input.updatedBy },
    });
  }

  getShop(shopId: string) {
    return this.prisma.shop.findUnique({ where: { id: shopId }, include: { locations: { orderBy: { isPrimary: 'desc' } } } });
  }

  updateShop(input: { shopId: string; name?: string; phone?: string; email?: string; logoUrl?: string; primaryColor?: string; timezone?: string; currency?: string }) {
    const { shopId, ...data } = input;
    return this.prisma.shop.update({ where: { id: shopId }, data });
  }
}
