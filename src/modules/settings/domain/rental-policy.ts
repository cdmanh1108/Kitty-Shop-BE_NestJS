export type DepositMethod = 'CASH' | 'DOCUMENT';
export const RENTAL_POLICY_SETTING_KEY = 'rental_policy';
export type DepositDocumentType = 'CCCD' | 'GPLX';

export interface CategoryDepositOverride {
  categoryId: string;
  cashAmount: number;
}

export interface RentalPricingPolicy {
  defaultRentalPrice: number;
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

export const DEFAULT_RENTAL_POLICY: RentalPolicy = {
  rentalPricing: {
    defaultRentalPrice: 50_000,
  },
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

export const RENTAL_POLICY_PROVIDER = Symbol('RENTAL_POLICY_PROVIDER');

export interface RentalPolicyProvider {
  getPolicy(shopId: string): Promise<RentalPolicy>;
}
