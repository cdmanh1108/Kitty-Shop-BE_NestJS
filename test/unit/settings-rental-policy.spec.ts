import {
  buildEffectiveRentalPolicy,
  DEFAULT_RENTAL_POLICY,
  mergeRentalPolicy,
  type DepositMethod,
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

  it('applies partial persisted values and fills remaining fields from defaults', () => {
    const stored: PersistedRentalPolicy = {
      rentalPricing: { defaultRentalPrice: 70_000 },
      deposit: {
        allowedMethods: ['CASH'],
        allowedDocumentTypes: ['CCCD'],
        defaultCashDeposit: 250_000,
        categoryOverrides: [{ categoryId: 'cat-1', cashAmount: 300_000 }],
      },
    };

    const effective = buildEffectiveRentalPolicy(stored);

    expect(effective.rentalPricing.defaultRentalPrice).toBe(70_000);
    expect(effective.deposit.defaultCashDeposit).toBe(250_000);
    expect(effective.deposit.allowedMethods).toEqual(['CASH']);
    expect(effective.deposit.categoryOverrides).toEqual([
      { categoryId: 'cat-1', cashAmount: 300_000 },
    ]);
    expect(effective.reschedule).toEqual(DEFAULT_RENTAL_POLICY.reschedule);
    expect(effective.lateReturn).toEqual(DEFAULT_RENTAL_POLICY.lateReturn);
    expect(effective.delivery).toEqual(DEFAULT_RENTAL_POLICY.delivery);
  });

  it('returns independent arrays and override objects without mutating defaults or stored values', () => {
    const storedDeposit = {
      allowedMethods: ['CASH'] as DepositMethod[],
      categoryOverrides: [{ categoryId: 'cat-1', cashAmount: 200_000 }],
    };
    const stored: PersistedRentalPolicy = {
      deposit: storedDeposit,
    };
    const storedMethods = [...storedDeposit.allowedMethods];
    const storedOverrides = storedDeposit.categoryOverrides.map((item) => ({ ...item }));
    const effective = buildEffectiveRentalPolicy(stored);

    effective.deposit.allowedMethods.push('DOCUMENT');
    const effectiveOverride = effective.deposit.categoryOverrides[0];
    if (!effectiveOverride) throw new Error('Expected the stored category override to be copied.');
    effectiveOverride.cashAmount = 0;

    expect(storedDeposit.allowedMethods).toEqual(storedMethods);
    expect(storedDeposit.categoryOverrides).toEqual(storedOverrides);
    expect(DEFAULT_RENTAL_POLICY.deposit.allowedMethods).toEqual(['CASH', 'DOCUMENT']);
    expect(DEFAULT_RENTAL_POLICY.deposit.categoryOverrides).toEqual([]);
  });

  it('preserves omitted fields while accepting false and zero in a partial update', () => {
    const base = buildEffectiveRentalPolicy();
    const patch = {
      rentalPricing: { defaultRentalPrice: 0 },
      deposit: { defaultCashDeposit: 0 },
      lateReturn: { feePerItemPerDay: 0 },
      loyalty: { enabled: false, stackableWithPromotions: false },
    } satisfies RentalPolicyPatch;

    const result = mergeRentalPolicy(base, patch);

    expect(result.rentalPricing.defaultRentalPrice).toBe(0);
    expect(result.deposit.defaultCashDeposit).toBe(0);
    expect(result.lateReturn.feePerItemPerDay).toBe(0);
    expect(result.loyalty.enabled).toBe(false);
    expect(result.loyalty.stackableWithPromotions).toBe(false);
    expect(result.reschedule).toEqual(base.reschedule);
    expect(result.delivery).toEqual(base.delivery);
  });

  it('replaces an explicitly supplied empty array and does not mutate the base or patch', () => {
    const base = buildEffectiveRentalPolicy();
    base.loyalty.enabled = true;
    const patch: RentalPolicyPatch = {
      deposit: {
        allowedMethods: [],
        categoryOverrides: [{ categoryId: 'cat-1', cashAmount: 200_000 }],
      },
      loyalty: { enabled: false },
    };
    const patchBefore = structuredClone(patch);

    const result = mergeRentalPolicy(base, patch);
    const resultOverride = result.deposit.categoryOverrides[0];
    if (!resultOverride) throw new Error('Expected the supplied category override to be copied.');
    resultOverride.cashAmount = 0;
    result.deposit.allowedMethods.push('CASH');

    expect(result.deposit.allowedMethods).toEqual(['CASH']);
    expect(base.deposit.allowedMethods).toEqual(['CASH', 'DOCUMENT']);
    expect(base.deposit.categoryOverrides).toEqual([]);
    expect(base.loyalty.enabled).toBe(true);
    expect(patch).toEqual(patchBefore);
  });

  it('validates the merged policy and preserves the existing cross-field error', () => {
    const next = mergeRentalPolicy(buildEffectiveRentalPolicy(), {
      specialCleaning: { feeMin: 50_000, feeMax: 30_000 },
    });

    expect(() => validateRentalPolicy(next)).toThrow(
      'Phí vệ sinh đặc biệt tối đa không được nhỏ hơn phí tối thiểu.',
    );
    expect(() => validateRentalPolicy(next)).toThrow(InvalidShopSettingsError);
  });

  it('validates enum values and duplicate category overrides', () => {
    const invalidMethod = 'CRYPTO' as DepositMethod;
    const invalidMethods = mergeRentalPolicy(buildEffectiveRentalPolicy(), {
      deposit: { allowedMethods: [invalidMethod] },
    });
    expect(() => validateRentalPolicy(invalidMethods)).toThrow(
      'Phương thức đặt cọc phải gồm tiền mặt hoặc giấy tờ.',
    );

    const duplicateOverrides = mergeRentalPolicy(buildEffectiveRentalPolicy(), {
      deposit: {
        categoryOverrides: [
          { categoryId: 'cat-1', cashAmount: 200_000 },
          { categoryId: 'cat-1', cashAmount: 300_000 },
        ],
      },
    });
    expect(() => validateRentalPolicy(duplicateOverrides)).toThrow(
      'Cấu hình tiền cọc bị trùng cho danh mục: cat-1.',
    );
  });

  it('rejects invalid numeric policy values', () => {
    const negativePrice = mergeRentalPolicy(buildEffectiveRentalPolicy(), {
      rentalPricing: { defaultRentalPrice: -1 },
    });
    expect(() => validateRentalPolicy(negativePrice)).toThrow(
      'Giá thuê mặc định phải là số nguyên không âm.',
    );

    const zeroRequiredRentals = mergeRentalPolicy(buildEffectiveRentalPolicy(), {
      loyalty: { rentalsRequired: 0 },
    });
    expect(() => validateRentalPolicy(zeroRequiredRentals)).toThrow(
      'Số lượt thuê cần để nhận thưởng phải ít nhất là 1.',
    );
  });
});
