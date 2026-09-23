/**
 * A persistence-filtered rental-rate candidate. Each scope must be ordered by
 * ascending duration so proportional fallback retains the established first-rate
 * behaviour.
 */
export interface RentalRateCandidate {
  durationDays: number;
  price: number;
}

export interface ResolveRentalPricingInput {
  durationDays: number;
  variantRates: readonly RentalRateCandidate[];
  productRates: readonly RentalRateCandidate[];
  variantDepositOverride: number | null | undefined;
  productDefaultDeposit: number;
}

export interface ResolvedRentalPricing {
  ratePrice: number | null;
  depositPerItem: number;
}

/**
 * Resolves one item price and deposit from already-filtered rental rates.
 *
 * Variant rates always take precedence over product rates at the same duration.
 * When neither an exact nor daily rate exists, the first candidate in the
 * variant scope (or product scope) is prorated. Callers supply candidates in
 * ascending duration order; this function never sorts or mutates them.
 */
export function resolveRentalPricing(input: ResolveRentalPricingInput): ResolvedRentalPricing {
  const days = Math.max(1, input.durationDays);
  const findRate = (durationDays: number) =>
    input.variantRates.find((rate) => rate.durationDays === durationDays) ??
    input.productRates.find((rate) => rate.durationDays === durationDays);

  const exactRate = findRate(days);
  let ratePrice: number | null = null;

  if (exactRate) {
    ratePrice = exactRate.price;
  } else {
    const dailyRate = findRate(1);
    if (dailyRate) {
      ratePrice = dailyRate.price * days;
    } else {
      const fallbackRate = input.variantRates[0] ?? input.productRates[0];
      if (fallbackRate && fallbackRate.durationDays > 0) {
        ratePrice = Math.round((fallbackRate.price / fallbackRate.durationDays) * days);
      }
    }
  }

  return {
    ratePrice,
    depositPerItem: input.variantDepositOverride ?? input.productDefaultDeposit,
  };
}
