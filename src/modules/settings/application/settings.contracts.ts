import type { JsonValue } from '@common/types/json';
import type {
  DeliveryPolicy,
  DepositPolicy,
  LateReturnPolicy,
  LoyaltyPolicy,
  RentalPricingPolicy,
  ReschedulePolicy,
  SpecialCleaningPolicy,
} from '../domain/rental-policy';

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

export interface UpdateRentalPolicyInput {
  rentalPricing?: Partial<RentalPricingPolicy>;
  deposit?: Partial<DepositPolicy>;
  delivery?: Partial<DeliveryPolicy>;
  reschedule?: Partial<ReschedulePolicy>;
  lateReturn?: Partial<LateReturnPolicy>;
  specialCleaning?: Partial<SpecialCleaningPolicy>;
  loyalty?: Partial<LoyaltyPolicy>;
}
