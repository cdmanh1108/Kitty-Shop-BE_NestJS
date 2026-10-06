import { InvalidShopSettingsError } from './rental-policy.errors';
import {
  buildEffectiveRentalPricingPolicy,
  mergeRentalPricingPolicy,
  validateRentalPricingPolicy,
  type RentalPricingPolicy,
} from './rental-pricing-policy';

export type { RentalPricingPolicy } from './rental-pricing-policy';

export type DepositMethod = 'CASH' | 'DOCUMENT';
export const RENTAL_POLICY_SETTING_KEY = 'rental_policy';
export type DepositDocumentType = 'CCCD' | 'GPLX';

export interface CategoryDepositOverride {
  categoryId: string;
  cashAmount: number;
}

export interface DepositPolicy {
  allowedMethods: DepositMethod[];
  allowedDocumentTypes: DepositDocumentType[];
  defaultCashDeposit: number;
  categoryOverrides: CategoryDepositOverride[];
}

export interface ReschedulePolicy {
  maxDaysFromBooking: number;
}

export interface LateReturnPolicy {
  feePerItemPerDay: number;
  newRentalChargeFromLateDay: number;
}

export interface SpecialCleaningPolicy {
  feeMin: number;
  feeMax: number;
}

export interface LoyaltyPolicy {
  enabled: boolean;
  rentalsRequired: number;
  rewardRentalValue: number;
  stackableWithPromotions: boolean;
}

export interface DeliveryPolicy {
  standardShippingFee: number;
}

export interface RentalPolicy {
  rentalPricing: RentalPricingPolicy;
  deposit: DepositPolicy;
  delivery: DeliveryPolicy;
  reschedule: ReschedulePolicy;
  lateReturn: LateReturnPolicy;
  specialCleaning: SpecialCleaningPolicy;
  loyalty: LoyaltyPolicy;
  updatedAt?: string;
}

export interface RentalPolicyPatch {
  rentalPricing?: Partial<RentalPricingPolicy>;
  deposit?: Partial<DepositPolicy>;
  delivery?: Partial<DeliveryPolicy>;
  reschedule?: Partial<ReschedulePolicy>;
  lateReturn?: Partial<LateReturnPolicy>;
  specialCleaning?: Partial<SpecialCleaningPolicy>;
  loyalty?: Partial<LoyaltyPolicy>;
}

export type PersistedRentalPolicy = Partial<{
  rentalPricing: Partial<RentalPricingPolicy>;
  deposit: Partial<DepositPolicy>;
  delivery: Partial<DeliveryPolicy>;
  reschedule: Partial<ReschedulePolicy>;
  lateReturn: Partial<LateReturnPolicy>;
  specialCleaning: Partial<SpecialCleaningPolicy>;
  loyalty: Partial<LoyaltyPolicy>;
}>;

export const DEFAULT_RENTAL_POLICY: RentalPolicy = {
  rentalPricing: buildEffectiveRentalPricingPolicy(),
  deposit: {
    allowedMethods: ['CASH', 'DOCUMENT'],
    allowedDocumentTypes: ['CCCD', 'GPLX'],
    defaultCashDeposit: 200_000,
    categoryOverrides: [],
  },
  delivery: {
    standardShippingFee: 30_000,
  },
  reschedule: {
    maxDaysFromBooking: 20,
  },
  lateReturn: {
    feePerItemPerDay: 10_000,
    newRentalChargeFromLateDay: 3,
  },
  specialCleaning: {
    feeMin: 30_000,
    feeMax: 50_000,
  },
  loyalty: {
    enabled: true,
    rentalsRequired: 5,
    rewardRentalValue: 50_000,
    stackableWithPromotions: false,
  },
};

export function buildEffectiveRentalPolicy(saved?: PersistedRentalPolicy | null): RentalPolicy {
  return {
    rentalPricing: buildEffectiveRentalPricingPolicy(saved?.rentalPricing),
    deposit: {
      allowedMethods: saved?.deposit?.allowedMethods
        ? [...saved.deposit.allowedMethods]
        : [...DEFAULT_RENTAL_POLICY.deposit.allowedMethods],
      allowedDocumentTypes: saved?.deposit?.allowedDocumentTypes
        ? [...saved.deposit.allowedDocumentTypes]
        : [...DEFAULT_RENTAL_POLICY.deposit.allowedDocumentTypes],
      defaultCashDeposit:
        saved?.deposit?.defaultCashDeposit ?? DEFAULT_RENTAL_POLICY.deposit.defaultCashDeposit,
      categoryOverrides: saved?.deposit?.categoryOverrides
        ? saved.deposit.categoryOverrides.map((item) => ({ ...item }))
        : [...DEFAULT_RENTAL_POLICY.deposit.categoryOverrides],
    },
    reschedule: {
      maxDaysFromBooking:
        saved?.reschedule?.maxDaysFromBooking ??
        DEFAULT_RENTAL_POLICY.reschedule.maxDaysFromBooking,
    },
    lateReturn: {
      feePerItemPerDay:
        saved?.lateReturn?.feePerItemPerDay ?? DEFAULT_RENTAL_POLICY.lateReturn.feePerItemPerDay,
      newRentalChargeFromLateDay:
        saved?.lateReturn?.newRentalChargeFromLateDay ??
        DEFAULT_RENTAL_POLICY.lateReturn.newRentalChargeFromLateDay,
    },
    specialCleaning: {
      feeMin: saved?.specialCleaning?.feeMin ?? DEFAULT_RENTAL_POLICY.specialCleaning.feeMin,
      feeMax: saved?.specialCleaning?.feeMax ?? DEFAULT_RENTAL_POLICY.specialCleaning.feeMax,
    },
    loyalty: {
      enabled: saved?.loyalty?.enabled ?? DEFAULT_RENTAL_POLICY.loyalty.enabled,
      rentalsRequired:
        saved?.loyalty?.rentalsRequired ?? DEFAULT_RENTAL_POLICY.loyalty.rentalsRequired,
      rewardRentalValue:
        saved?.loyalty?.rewardRentalValue ?? DEFAULT_RENTAL_POLICY.loyalty.rewardRentalValue,
      stackableWithPromotions:
        saved?.loyalty?.stackableWithPromotions ??
        DEFAULT_RENTAL_POLICY.loyalty.stackableWithPromotions,
    },
    delivery: {
      standardShippingFee:
        saved?.delivery?.standardShippingFee ?? DEFAULT_RENTAL_POLICY.delivery.standardShippingFee,
    },
  };
}

export function mergeRentalPolicy(base: RentalPolicy, patch: RentalPolicyPatch): RentalPolicy {
  return {
    rentalPricing: mergeRentalPricingPolicy(base.rentalPricing, patch.rentalPricing ?? {}),
    deposit: {
      allowedMethods: patch.deposit?.allowedMethods
        ? [...patch.deposit.allowedMethods]
        : [...base.deposit.allowedMethods],
      allowedDocumentTypes: patch.deposit?.allowedDocumentTypes
        ? [...patch.deposit.allowedDocumentTypes]
        : [...base.deposit.allowedDocumentTypes],
      defaultCashDeposit: patch.deposit?.defaultCashDeposit ?? base.deposit.defaultCashDeposit,
      categoryOverrides: patch.deposit?.categoryOverrides
        ? patch.deposit.categoryOverrides.map((item) => ({ ...item }))
        : base.deposit.categoryOverrides.map((item) => ({ ...item })),
    },
    delivery: {
      standardShippingFee: patch.delivery?.standardShippingFee ?? base.delivery.standardShippingFee,
    },
    reschedule: {
      maxDaysFromBooking:
        patch.reschedule?.maxDaysFromBooking ?? base.reschedule.maxDaysFromBooking,
    },
    lateReturn: {
      feePerItemPerDay: patch.lateReturn?.feePerItemPerDay ?? base.lateReturn.feePerItemPerDay,
      newRentalChargeFromLateDay:
        patch.lateReturn?.newRentalChargeFromLateDay ?? base.lateReturn.newRentalChargeFromLateDay,
    },
    specialCleaning: {
      feeMin: patch.specialCleaning?.feeMin ?? base.specialCleaning.feeMin,
      feeMax: patch.specialCleaning?.feeMax ?? base.specialCleaning.feeMax,
    },
    loyalty: {
      enabled: patch.loyalty?.enabled ?? base.loyalty.enabled,
      rentalsRequired: patch.loyalty?.rentalsRequired ?? base.loyalty.rentalsRequired,
      rewardRentalValue: patch.loyalty?.rewardRentalValue ?? base.loyalty.rewardRentalValue,
      stackableWithPromotions:
        patch.loyalty?.stackableWithPromotions ?? base.loyalty.stackableWithPromotions,
    },
  };
}

export function validateRentalPolicy(policy: RentalPolicy): void {
  validateRentalPricingPolicy(policy.rentalPricing);

  if (
    !Number.isInteger(policy.deposit.defaultCashDeposit) ||
    policy.deposit.defaultCashDeposit < 0
  ) {
    throw new InvalidShopSettingsError('Tiền cọc mặc định phải là số nguyên không âm.');
  }

  if (
    !Array.isArray(policy.deposit.allowedMethods) ||
    policy.deposit.allowedMethods.length === 0 ||
    policy.deposit.allowedMethods.some((method) => !['CASH', 'DOCUMENT'].includes(method))
  ) {
    throw new InvalidShopSettingsError('Phương thức đặt cọc phải gồm tiền mặt hoặc giấy tờ.');
  }

  if (
    !Array.isArray(policy.deposit.allowedDocumentTypes) ||
    policy.deposit.allowedDocumentTypes.some((type) => !['CCCD', 'GPLX'].includes(type))
  ) {
    throw new InvalidShopSettingsError(
      'Loại giấy tờ đặt cọc phải là căn cước công dân hoặc giấy phép lái xe.',
    );
  }

  if (policy.deposit.categoryOverrides) {
    const seen = new Set<string>();
    for (const override of policy.deposit.categoryOverrides) {
      if (seen.has(override.categoryId)) {
        throw new InvalidShopSettingsError(
          `Cấu hình tiền cọc bị trùng cho danh mục: ${override.categoryId}.`,
        );
      }
      seen.add(override.categoryId);
      if (!Number.isInteger(override.cashAmount) || override.cashAmount < 0) {
        throw new InvalidShopSettingsError(
          'Tiền cọc riêng của danh mục phải là số nguyên không âm.',
        );
      }
    }
  }

  if (
    !Number.isInteger(policy.reschedule.maxDaysFromBooking) ||
    policy.reschedule.maxDaysFromBooking < 1
  ) {
    throw new InvalidShopSettingsError(
      'Số ngày tối đa được đổi lịch kể từ khi đặt thuê phải ít nhất là 1.',
    );
  }

  if (
    !Number.isInteger(policy.lateReturn.feePerItemPerDay) ||
    policy.lateReturn.feePerItemPerDay < 0
  ) {
    throw new InvalidShopSettingsError('Phí trả trễ mỗi món mỗi ngày phải là số nguyên không âm.');
  }

  if (
    !Number.isInteger(policy.lateReturn.newRentalChargeFromLateDay) ||
    policy.lateReturn.newRentalChargeFromLateDay < 1
  ) {
    throw new InvalidShopSettingsError(
      'Ngày trả trễ bắt đầu tính lượt thuê mới phải ít nhất là 1.',
    );
  }

  if (!Number.isInteger(policy.specialCleaning.feeMin) || policy.specialCleaning.feeMin < 0) {
    throw new InvalidShopSettingsError(
      'Phí vệ sinh đặc biệt tối thiểu phải là số nguyên không âm.',
    );
  }

  if (!Number.isInteger(policy.specialCleaning.feeMax) || policy.specialCleaning.feeMax < 0) {
    throw new InvalidShopSettingsError('Phí vệ sinh đặc biệt tối đa phải là số nguyên không âm.');
  }

  if (policy.specialCleaning.feeMax < policy.specialCleaning.feeMin) {
    throw new InvalidShopSettingsError(
      'Phí vệ sinh đặc biệt tối đa không được nhỏ hơn phí tối thiểu.',
    );
  }

  if (typeof policy.loyalty.enabled !== 'boolean') {
    throw new InvalidShopSettingsError('Trạng thái bật tích điểm phải là giá trị đúng hoặc sai.');
  }

  if (!Number.isInteger(policy.loyalty.rentalsRequired) || policy.loyalty.rentalsRequired < 1) {
    throw new InvalidShopSettingsError('Số lượt thuê cần để nhận thưởng phải ít nhất là 1.');
  }

  if (!Number.isInteger(policy.loyalty.rewardRentalValue) || policy.loyalty.rewardRentalValue < 0) {
    throw new InvalidShopSettingsError('Giá trị thưởng thuê phải là số nguyên không âm.');
  }

  if (typeof policy.loyalty.stackableWithPromotions !== 'boolean') {
    throw new InvalidShopSettingsError(
      'Tùy chọn kết hợp tích điểm với khuyến mãi phải là giá trị đúng hoặc sai.',
    );
  }
}

export const RENTAL_POLICY_PROVIDER = Symbol('RENTAL_POLICY_PROVIDER');

export interface RentalPolicyProvider {
  getPolicy(shopId: string): Promise<RentalPolicy>;
}
