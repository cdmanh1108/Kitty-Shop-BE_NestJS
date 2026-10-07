import {
  buildEffectiveRentalPolicy,
  DEFAULT_RENTAL_POLICY,
  mergeRentalPolicy,
  type PersistedRentalPolicy,
  type RentalPolicyPatch,
  validateRentalPolicy,
} from '../../src/modules/settings/domain/rental-policy';
import { InvalidShopSettingsError } from '../../src/modules/settings/domain/rental-policy.errors';

describe('RentalPolicy domain rules', () => {
  it('builds the canonical defaults when no policy is persisted', () => {
    expect(buildEffectiveRentalPolicy()).toEqual(DEFAULT_RENTAL_POLICY);
    expect(buildEffectiveRentalPolicy(null)).toEqual(DEFAULT_RENTAL_POLICY);
  });

  it('reads editable values and ignores legacy persisted policy fields', () => {
    const stored = {
      rentalPricing: {
        defaultRentalPrice: 70_000,
        additionalDayFee: 12_000,
        bulkQuantityThreshold: 99,
        standardRenewalDay: 2,
        bulkRenewalDay: 4,
        maxOnlineRentalDays: 30,
      },
      deposit: {
        defaultCashDeposit: 250_000,
        allowedMethods: ['CASH'],
        allowedDocumentTypes: ['CCCD'],
        categoryOverrides: [{ categoryId: 'cat-1', cashAmount: 300_000 }],
      },
      delivery: { standardShippingFee: 0 },
      reschedule: { maxDaysFromBooking: 1 },
    } as unknown as PersistedRentalPolicy;

    const effective = buildEffectiveRentalPolicy(stored);

    expect(effective.rentalPricing).toEqual({
      ...DEFAULT_RENTAL_POLICY.rentalPricing,
      defaultRentalPrice: 70_000,
      additionalDayFee: 12_000,
    });
    expect(effective.deposit.defaultCashDeposit).toBe(250_000);
    expect(effective.deposit.allowedMethods).toEqual(DEFAULT_RENTAL_POLICY.deposit.allowedMethods);
    expect(effective.deposit.allowedDocumentTypes).toEqual(
      DEFAULT_RENTAL_POLICY.deposit.allowedDocumentTypes,
    );
    expect(effective.deposit.categoryOverrides).toEqual([]);
    expect(effective.delivery).toEqual(DEFAULT_RENTAL_POLICY.delivery);
    expect(effective.reschedule).toEqual(DEFAULT_RENTAL_POLICY.reschedule);
  });

  it('returns independent fixed policy data without mutating defaults', () => {
    const effective = buildEffectiveRentalPolicy();
    effective.deposit.allowedMethods.push('DOCUMENT');
    effective.deposit.categoryOverrides.push({ categoryId: 'local', cashAmount: 1 });
    effective.delivery.standardShippingFee = 0;

    expect(DEFAULT_RENTAL_POLICY.deposit.allowedMethods).toEqual(['CASH', 'DOCUMENT']);
    expect(DEFAULT_RENTAL_POLICY.deposit.categoryOverrides).toEqual([]);
    expect(DEFAULT_RENTAL_POLICY.delivery.standardShippingFee).toBe(30_000);
  });

  it('updates only the three editable values and preserves fixed business rules', () => {
    const base = buildEffectiveRentalPolicy();
    const patch = {
      rentalPricing: { defaultRentalPrice: 0, additionalDayFee: 0 },
      deposit: { defaultCashDeposit: 0 },
    } satisfies RentalPolicyPatch;

    const result = mergeRentalPolicy(base, patch);

    expect(result.rentalPricing.defaultRentalPrice).toBe(0);
    expect(result.rentalPricing.additionalDayFee).toBe(0);
    expect(result.deposit.defaultCashDeposit).toBe(0);
    expect(result.rentalPricing.bulkQuantityThreshold).toBe(
      DEFAULT_RENTAL_POLICY.rentalPricing.bulkQuantityThreshold,
    );
    expect(result.rentalPricing.standardRenewalDay).toBe(
      DEFAULT_RENTAL_POLICY.rentalPricing.standardRenewalDay,
    );
    expect(result.delivery).toEqual(base.delivery);
    expect(result.reschedule).toEqual(base.reschedule);
    expect(result.lateReturn).toEqual(base.lateReturn);
    expect(result.specialCleaning).toEqual(base.specialCleaning);
    expect(result.loyalty).toEqual(base.loyalty);
  });

  it('validates fixed policy invariants', () => {
    const base = buildEffectiveRentalPolicy();
    const invalid = {
      ...base,
      specialCleaning: { feeMin: 50_000, feeMax: 30_000 },
    };

    expect(() => validateRentalPolicy(invalid)).toThrow(
      'Phí vệ sinh đặc biệt tối đa không được nhỏ hơn phí tối thiểu.',
    );
    expect(() => validateRentalPolicy(invalid)).toThrow(InvalidShopSettingsError);
  });

  it('rejects invalid editable numeric values', () => {
    const negativePrice = mergeRentalPolicy(buildEffectiveRentalPolicy(), {
      rentalPricing: { defaultRentalPrice: -1 },
    });

    expect(() => validateRentalPolicy(negativePrice)).toThrow(
      'Giá thuê mặc định phải là số nguyên không âm.',
    );
  });
});
