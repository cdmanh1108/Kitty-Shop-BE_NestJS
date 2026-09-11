import type { JsonValue } from '@common/types/json';
import { PrismaService } from '@database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RentalPolicy } from '../domain/rental-policy';
import type { SettingsRepository } from '../domain/settings.repository';

const RENTAL_POLICY_SETTING_KEY = 'rental_policy';

@Injectable()
export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(shopId: string) {
    return this.prisma.appSetting.findMany({ where: { shopId }, orderBy: { key: 'asc' } });
  }

  upsert(input: {
    shopId: string;
    key: string;
    value: JsonValue;
    description?: string;
    updatedBy: string;
  }) {
    const value = JSON.parse(JSON.stringify(input.value)) as Prisma.InputJsonValue;
    return this.prisma.appSetting.upsert({
      where: { shopId_key: { shopId: input.shopId, key: input.key } },
      create: {
        shopId: input.shopId,
        key: input.key,
        value,
        description: input.description,
        updatedBy: input.updatedBy,
      },
      update: { value, description: input.description, updatedBy: input.updatedBy },
    });
  }

  getShop(shopId: string) {
    return this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { locations: { orderBy: { isPrimary: 'desc' } } },
    });
  }

  updateShop(input: {
    shopId: string;
    name?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
    primaryColor?: string;
    timezone?: string;
    currency?: string;
  }) {
    const { shopId, ...data } = input;
    return this.prisma.shop.update({ where: { id: shopId }, data });
  }

  async getRentalPolicy(
    shopId: string,
  ): Promise<{ policy: RentalPolicy; updatedAt: Date } | null> {
    const row = await this.prisma.appSetting.findUnique({
      where: { shopId_key: { shopId, key: RENTAL_POLICY_SETTING_KEY } },
    });
    if (!row) return null;
    return {
      policy: row.value as unknown as RentalPolicy,
      updatedAt: row.updatedAt,
    };
  }

  async saveRentalPolicy(
    shopId: string,
    policy: RentalPolicy,
    updatedBy: string,
  ): Promise<{ policy: RentalPolicy; updatedAt: Date }> {
    const value = JSON.parse(JSON.stringify(policy)) as Prisma.InputJsonValue;
    const row = await this.prisma.appSetting.upsert({
      where: { shopId_key: { shopId, key: RENTAL_POLICY_SETTING_KEY } },
      create: {
        shopId,
        key: RENTAL_POLICY_SETTING_KEY,
        value,
        description: 'Shop rental and deposit policy configuration',
        updatedBy,
      },
      update: {
        value,
        description: 'Shop rental and deposit policy configuration',
        updatedBy,
      },
    });
    return {
      policy: row.value as unknown as RentalPolicy,
      updatedAt: row.updatedAt,
    };
  }
}
