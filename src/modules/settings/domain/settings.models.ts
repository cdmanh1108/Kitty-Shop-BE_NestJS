import type {
  AppSettingRecord,
  ShopLocationRecord,
  ShopRecord,
} from '@modules/settings/domain/settings.records';

export type SettingList = Array<AppSettingRecord>;

export type ShopDetails =
  | null
  | (ShopRecord & {
      locations: Array<ShopLocationRecord>;
    });
