import type { JsonValue } from '@common/types/json';
import type { RentalPolicyPatch } from '../domain/rental-policy';

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

export type UpdateRentalPolicyInput = RentalPolicyPatch;
