import type { ShopRecord } from '@modules/settings/domain/settings.records';
import type { AppSettingRecord } from '@modules/settings/domain/settings.records';
import type { JsonValue } from '@common/types/json';
import type { SettingList, ShopDetails } from './settings.models';
import type { RentalPolicy } from './rental-policy';

export const SETTINGS_REPOSITORY = Symbol('SETTINGS_REPOSITORY');

export interface SettingsRepository {
  list(shopId: string): Promise<SettingList>;
  upsert(input: SettingsUpsertData): Promise<AppSettingRecord>;
  getShop(shopId: string): Promise<ShopDetails>;
  updateShop(input: SettingsUpdateShopData): Promise<ShopRecord>;
  getRentalPolicy(shopId: string): Promise<{ policy: RentalPolicy; updatedAt: Date } | null>;
  saveRentalPolicy(
    shopId: string,
    policy: RentalPolicy,
    updatedBy: string,
  ): Promise<{ policy: RentalPolicy; updatedAt: Date }>;
}

export interface SettingsUpsertData {
  shopId: string;
  key: string;
  value: JsonValue;
  description?: string;
  updatedBy: string;
}

export interface SettingsUpdateShopData {
  shopId: string;
  name?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  primaryColor?: string;
  timezone?: string;
  currency?: string;
}
