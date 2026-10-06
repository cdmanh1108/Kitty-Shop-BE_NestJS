import {
  validateRentalPricingPolicy,
  type RentalPricingPolicy,
} from '@modules/settings/public/rental-policy';
import { RentalInvariantError } from './rental-errors';
import { RENTAL_PRICING_VERSION } from './rental-pricing-version';

export interface ResolveRentalCyclePricingInput {
  durationDays: number;
  /** Total ordinary physical units in the order; complimentary accessories are excluded. */
  billableQuantity: number;
  policy: Readonly<RentalPricingPolicy>;
  orderCyclePriceOverride?: number | null;
  itemCyclePriceOverride?: number | null;
}

/** One physical unit's total rental price, with the effective rules ready for an RP03 snapshot. */
export interface ResolvedRentalCyclePricing {
  version: typeof RENTAL_PRICING_VERSION.CYCLE;
  durationDays: number;
  billableQuantity: number;
  renewalDay: number;
  cycleLengthDays: number;
  cycleCount: number;
  additionalDayCount: number;
  cyclePrice: number;
  additionalDayFee: number;
  priceSource: 'SHOP' | 'ORDER' | 'ITEM';
  unitRentalPrice: number;
}

/**
 * Renewal days replace the additional-day fee with the effective cycle price.
 * A renewal on day 5 repeats every 4 days (1, 5, 9, ...); day 8 repeats every 7.
 * Integer cents keep decimal overrides exact during arithmetic. Existing callers
 * of resolveRentalPricing continue using legacy rates until RP03 integrates this path.
 */
export function resolveRentalCyclePricing(
  input: ResolveRentalCyclePricingInput,
): ResolvedRentalCyclePricing {
  if (!Number.isSafeInteger(input.durationDays) || input.durationDays < 1) {
    throw new RentalInvariantError(
      'INVALID_RENTAL_PRICING_DURATION',
      'Số ngày tính giá thuê phải là số nguyên dương hợp lệ.',
    );
  }
  if (!Number.isSafeInteger(input.billableQuantity) || input.billableQuantity < 1) {
    throw new RentalInvariantError(
      'INVALID_RENTAL_PRICING_QUANTITY',
      'Số món thuê thông thường trong đơn phải là số nguyên dương hợp lệ.',
    );
  }
  validateRentalPricingPolicy(input.policy);

  const orderPrice = input.orderCyclePriceOverride;
  const itemPrice = input.itemCyclePriceOverride;
  // Validate supplied overrides even when a more specific override wins.
  if (orderPrice != null) cyclePriceCents(orderPrice);
  if (itemPrice != null) cyclePriceCents(itemPrice);
  const cyclePrice = itemPrice ?? orderPrice ?? input.policy.defaultRentalPrice;
  const priceSource = itemPrice != null ? 'ITEM' : orderPrice != null ? 'ORDER' : 'SHOP';
  const renewalDay =
    input.billableQuantity >= input.policy.bulkQuantityThreshold
      ? input.policy.bulkRenewalDay
      : input.policy.standardRenewalDay;
  const cycleLengthDays = renewalDay - 1;
  const cycleCount = 1 + Number(BigInt(input.durationDays - 1) / BigInt(cycleLengthDays));
  const additionalDayCount = input.durationDays - cycleCount;
  const totalCents =
    BigInt(cycleCount) * cyclePriceCents(cyclePrice) +
    BigInt(additionalDayCount) * BigInt(input.policy.additionalDayFee) * 100n;
  if (totalCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RentalInvariantError(
      'RENTAL_PRICING_AMOUNT_EXCEEDED',
      'Tổng giá thuê vượt quá giới hạn tính toán. Vui lòng kiểm tra lại giá và thời gian thuê.',
    );
  }

  return {
    version: RENTAL_PRICING_VERSION.CYCLE,
    durationDays: input.durationDays,
    billableQuantity: input.billableQuantity,
    renewalDay,
    cycleLengthDays,
    cycleCount,
    additionalDayCount,
    cyclePrice,
    additionalDayFee: input.policy.additionalDayFee,
    priceSource,
    unitRentalPrice: Number(totalCents) / 100,
  };
}

function cyclePriceCents(value: number): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.toString());
  if (!Number.isFinite(value) || value < 0 || !match) {
    throw new RentalInvariantError(
      'INVALID_RENTAL_CYCLE_PRICE',
      'Giá một lượt thuê phải là số không âm và có tối đa hai chữ số thập phân.',
    );
  }
  const amount = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RentalInvariantError(
      'INVALID_RENTAL_CYCLE_PRICE',
      'Giá một lượt thuê vượt quá giới hạn tính toán.',
    );
  }
  return amount;
}
