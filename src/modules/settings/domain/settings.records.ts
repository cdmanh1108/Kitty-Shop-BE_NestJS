import type { DecimalValue } from '@common/types/decimal';
import type { JsonValue } from '@common/types/json';

export interface ShopLocationRecord {
  id: string;
  shopId: string;
  code: string;
  name: string;
  phone: string | null;
  addressLine: string | null;
  ward: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  country: string;
  latitude: DecimalValue | null;
  longitude: DecimalValue | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppSettingRecord {
  id: string;
  shopId: string;
  key: string;
  value: JsonValue;
  description: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface ShopRecord {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  timezone: string;
  logoUrl: string | null;
  primaryColor: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
