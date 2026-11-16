import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import type { RentalCyclePricingSnapshot } from '../../src/modules/rentals/domain/rental-pricing-snapshot';

export function cyclePricingSnapshot(input: {
  durationDays: number;
  unitRentalPrice: number;
  depositPerItem: number;
  billableQuantity?: number;
  additionalDayFee?: number;
}): RentalCyclePricingSnapshot {
  const billableQuantity = input.billableQuantity ?? 1;
  const policy = { ...DEFAULT_RENTAL_POLICY.rentalPricing };
  policy.additionalDayFee = input.additionalDayFee ?? policy.additionalDayFee;
  const renewalDay =
    billableQuantity >= policy.bulkQuantityThreshold
      ? policy.bulkRenewalDay
      : policy.standardRenewalDay;
  const cycleLengthDays = renewalDay - 1;
  const cycleCount = 1 + Math.floor((input.durationDays - 1) / cycleLengthDays);
  const additionalDayCount = input.durationDays - cycleCount;
  policy.defaultRentalPrice = input.unitRentalPrice - additionalDayCount * policy.additionalDayFee;

  return {
    version: 'CYCLE_V1',
    durationDays: input.durationDays,
    billableQuantity,
    renewalDay,
    cycleLengthDays,
    cycleCount,
    additionalDayCount,
    cyclePrice: policy.defaultRentalPrice,
    additionalDayFee: policy.additionalDayFee,
    priceSource: 'SHOP',
    unitRentalPrice: input.unitRentalPrice,
    policy,
    orderCyclePriceOverride: null,
    itemCyclePriceOverride: null,
    depositPerItem: input.depositPerItem,
  };
}
