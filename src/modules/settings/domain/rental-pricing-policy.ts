import { InvalidShopSettingsError } from './rental-policy.errors';

export interface RentalPricingPolicy {
  defaultRentalPrice: number;
  additionalDayFee: number;
  bulkQuantityThreshold: number;
  standardRenewalDay: number;
  bulkRenewalDay: number;
  maxOnlineRentalDays: number;
}

export const RENTAL_PRICING_LIMITS = {
  maxAmount: 100_000_000,
  maxQuantityThreshold: 1_000,
  maxDays: 365,
} as const;

export const DEFAULT_RENTAL_PRICING_POLICY: Readonly<RentalPricingPolicy> = Object.freeze({
  defaultRentalPrice: 50_000,
  additionalDayFee: 10_000,
  bulkQuantityThreshold: 3,
  standardRenewalDay: 5,
  bulkRenewalDay: 8,
  maxOnlineRentalDays: 9,
});

/** Load only shop-editable prices; all other pricing rules stay at backend defaults. */
export function buildEffectiveRentalPricingPolicy(
  saved?: Partial<RentalPricingPolicy> | null,
): RentalPricingPolicy {
  return {
    ...DEFAULT_RENTAL_PRICING_POLICY,
    defaultRentalPrice:
      saved?.defaultRentalPrice ?? DEFAULT_RENTAL_PRICING_POLICY.defaultRentalPrice,
    additionalDayFee: saved?.additionalDayFee ?? DEFAULT_RENTAL_PRICING_POLICY.additionalDayFee,
  };
}

export type EditableRentalPricingPolicy = Pick<
  RentalPricingPolicy,
  'defaultRentalPrice' | 'additionalDayFee'
>;

export function mergeRentalPricingPolicy(
  base: Readonly<RentalPricingPolicy>,
  patch: Partial<EditableRentalPricingPolicy>,
): RentalPricingPolicy {
  return {
    ...base,
    defaultRentalPrice: patch.defaultRentalPrice ?? base.defaultRentalPrice,
    additionalDayFee: patch.additionalDayFee ?? base.additionalDayFee,
  };
}

export function validateRentalPricingPolicy(policy: Readonly<RentalPricingPolicy>): void {
  if (!Number.isSafeInteger(policy.defaultRentalPrice) || policy.defaultRentalPrice < 0) {
    throw new InvalidShopSettingsError('Giá thuê mặc định phải là số nguyên không âm.');
  }
  if (policy.defaultRentalPrice > RENTAL_PRICING_LIMITS.maxAmount) {
    throw new InvalidShopSettingsError('Giá một lượt thuê không được vượt quá 100.000.000đ.');
  }
  if (
    !Number.isSafeInteger(policy.additionalDayFee) ||
    policy.additionalDayFee < 0 ||
    policy.additionalDayFee > RENTAL_PRICING_LIMITS.maxAmount
  ) {
    throw new InvalidShopSettingsError(
      'Phụ phí mỗi ngày tiếp theo phải là số nguyên từ 0 đến 100.000.000đ.',
    );
  }
  if (
    !Number.isSafeInteger(policy.bulkQuantityThreshold) ||
    policy.bulkQuantityThreshold < 1 ||
    policy.bulkQuantityThreshold > RENTAL_PRICING_LIMITS.maxQuantityThreshold
  ) {
    throw new InvalidShopSettingsError(
      'Ngưỡng số món hưởng chu kỳ dài phải là số nguyên từ 1 đến 1.000.',
    );
  }
  if (
    !Number.isSafeInteger(policy.standardRenewalDay) ||
    policy.standardRenewalDay < 2 ||
    policy.standardRenewalDay > RENTAL_PRICING_LIMITS.maxDays
  ) {
    throw new InvalidShopSettingsError(
      'Ngày bắt đầu lượt tiếp theo cho đơn dưới ngưỡng phải là số nguyên từ 2 đến 365.',
    );
  }
  if (
    !Number.isSafeInteger(policy.bulkRenewalDay) ||
    policy.bulkRenewalDay < 2 ||
    policy.bulkRenewalDay > RENTAL_PRICING_LIMITS.maxDays
  ) {
    throw new InvalidShopSettingsError(
      'Ngày bắt đầu lượt tiếp theo cho đơn đạt ngưỡng phải là số nguyên từ 2 đến 365.',
    );
  }
  if (policy.bulkRenewalDay < policy.standardRenewalDay) {
    throw new InvalidShopSettingsError(
      'Mốc lượt mới cho đơn đạt ngưỡng không được sớm hơn mốc cho đơn dưới ngưỡng.',
    );
  }
  if (
    !Number.isSafeInteger(policy.maxOnlineRentalDays) ||
    policy.maxOnlineRentalDays < 1 ||
    policy.maxOnlineRentalDays > RENTAL_PRICING_LIMITS.maxDays
  ) {
    throw new InvalidShopSettingsError(
      'Số ngày tối đa đặt qua website phải là số nguyên từ 1 đến 365.',
    );
  }
}
