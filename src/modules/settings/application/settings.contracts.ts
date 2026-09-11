import type { JsonValue } from '@common/types/json';
export interface UpdateShopInput {
  name?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  primaryColor?: string;
  timezone?: string;
  currency?: string;
}

export interface UpsertSettingInput {
  value: JsonValue;
  description?: string;
}
