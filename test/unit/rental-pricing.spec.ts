import { resolveRentalPricing } from '../../src/modules/rentals/domain/rental-pricing';

describe('resolveRentalPricing', () => {
  const resolve = (overrides: Partial<Parameters<typeof resolveRentalPricing>[0]> = {}) =>
    resolveRentalPricing({
      durationDays: 3,
      variantRates: [],
      productRates: [],
      variantDepositOverride: null,
      productDefaultDeposit: 300000,
      ...overrides,
    });

  it('uses an exact variant rate before an exact product rate', () => {
    expect(
      resolve({
        variantRates: [{ durationDays: 3, price: 120000 }],
        productRates: [{ durationDays: 3, price: 100000 }],
      }),
    ).toMatchObject({ ratePrice: 120000 });
  });

  it('uses an exact product rate when the variant has no matching rate', () => {
    expect(resolve({ productRates: [{ durationDays: 3, price: 100000 }] })).toMatchObject({
      ratePrice: 100000,
    });
  });

  it('uses variant daily pricing before product daily pricing without rounding', () => {
    expect(
      resolve({
        variantRates: [{ durationDays: 1, price: 40000.25 }],
        productRates: [{ durationDays: 1, price: 30000 }],
      }),
    ).toMatchObject({ ratePrice: 120000.75 });
    expect(resolve({ productRates: [{ durationDays: 1, price: 30000.25 }] })).toMatchObject({
      ratePrice: 90000.75,
    });
  });

  it('prorates the first variant candidate before product candidates and rounds the result', () => {
    expect(
      resolve({
        variantRates: [
          { durationDays: 4, price: 100001 },
          { durationDays: 7, price: 50000 },
        ],
        productRates: [{ durationDays: 2, price: 40000 }],
      }),
    ).toMatchObject({ ratePrice: Math.round((100001 / 4) * 3) });
    expect(resolve({ productRates: [{ durationDays: 2, price: 1 }] })).toMatchObject({
      ratePrice: 2,
    });
  });

  it('uses the first ordered product candidate for proportional fallback', () => {
    expect(
      resolve({
        productRates: [
          { durationDays: 2, price: 20000 },
          { durationDays: 5, price: 50000 },
        ],
      }),
    ).toMatchObject({ ratePrice: 30000 });
  });

  it('preserves missing and zero price semantics', () => {
    expect(resolve()).toMatchObject({ ratePrice: null });
    expect(resolve({ productRates: [{ durationDays: 3, price: 0 }] })).toMatchObject({
      ratePrice: 0,
    });
    expect(resolve({ productRates: [{ durationDays: 0, price: 100000 }] })).toMatchObject({
      ratePrice: null,
    });
  });

  it('clamps non-positive durations and retains zero deposit overrides', () => {
    const dailyRate = [{ durationDays: 1, price: 50000 }];
    expect(resolve({ durationDays: 0, productRates: dailyRate })).toMatchObject({
      ratePrice: 50000,
    });
    expect(resolve({ durationDays: -2, productRates: dailyRate })).toMatchObject({
      ratePrice: 50000,
    });
    expect(resolve({ variantDepositOverride: 0 })).toMatchObject({ depositPerItem: 0 });
    expect(resolve({ variantDepositOverride: null })).toMatchObject({ depositPerItem: 300000 });
    expect(resolve({ variantDepositOverride: undefined })).toMatchObject({
      depositPerItem: 300000,
    });
  });

  it('does not mutate its input', () => {
    const input = {
      durationDays: 3,
      variantRates: [{ durationDays: 4, price: 100001 }],
      productRates: [{ durationDays: 2, price: 40000 }],
      variantDepositOverride: null,
      productDefaultDeposit: 300000,
    };
    const before = JSON.stringify(input);

    expect(resolveRentalPricing(input)).toMatchObject({
      ratePrice: Math.round((100001 / 4) * 3),
      depositPerItem: 300000,
    });
    expect(JSON.stringify(input)).toBe(before);
  });
});
