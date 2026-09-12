import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import { canTransitionRental } from '../../src/modules/rentals/domain/rental-policy';
import { RentalInvariantError } from '../../src/modules/rentals/domain/rental-errors';
import {
  assertRentalConfirmation,
  calculateLateCharges,
  rewardForCompletedRental,
} from '../../src/modules/rentals/domain/rental-settlement';

const policy = DEFAULT_RENTAL_POLICY;
const payment = (amount: string, purpose = 'RENTAL_PAYMENT') => ({
  amount,
  purpose,
  direction: 'IN',
});
const confirm = (overrides: Partial<Parameters<typeof assertRentalConfirmation>[0]> = {}) => ({
  rentalDue: '200000.00',
  depositRequired: '100000.00',
  collateralMethod: 'CASH',
  documentType: null,
  collateralStatus: 'REQUIRED',
  payments: [payment('200000.00'), payment('100000.00', 'DEPOSIT')],
  policy,
  ...overrides,
});

describe('rental lifecycle policy', () => {
  it('never starts RESERVED directly; only CONFIRMED may start', () => {
    expect(canTransitionRental('RESERVED', 'ACTIVE')).toBe(false);
    expect(canTransitionRental('CONFIRMED', 'ACTIVE')).toBe(true);
    expect(canTransitionRental('ACTIVE', 'ACTIVE')).toBe(false);
  });

  it.each([[[]], [[payment('199999.00')]], [[payment('100000.00', 'DEPOSIT')]]])(
    'rejects missing or partial rental payment',
    (payments) => {
      expect(() => assertRentalConfirmation(confirm({ payments }))).toThrow(
        RentalInvariantError,
      );
    },
  );

  it('accepts overpayment and excludes deposit from rental payment', () => {
    expect(() =>
      assertRentalConfirmation(
        confirm({ payments: [payment('220000.00'), payment('100000.00', 'DEPOSIT')] }),
      ),
    ).not.toThrow();
    expect(() =>
      assertRentalConfirmation(
        confirm({ payments: [payment('100000.00'), payment('200000.00', 'DEPOSIT')] }),
      ),
    ).toThrow(RentalInvariantError);
  });

  it('requires held cash deposit for pickup and delivery', () => {
    expect(() => assertRentalConfirmation(confirm({ payments: [payment('200000.00')] }))).toThrow(
      RentalInvariantError,
    );
    expect(() => assertRentalConfirmation(confirm())).not.toThrow();
  });

  it('validates document method, allowed type and physical receipt', () => {
    expect(() => assertRentalConfirmation(confirm({ collateralMethod: 'UNKNOWN' }))).toThrow(
      RentalInvariantError,
    );
    expect(() =>
      assertRentalConfirmation(
        confirm({
          collateralMethod: 'DOCUMENT',
          documentType: 'PASSPORT',
          collateralStatus: 'HELD',
        }),
      ),
    ).toThrow(RentalInvariantError);
    expect(() =>
      assertRentalConfirmation(confirm({ collateralMethod: 'DOCUMENT', documentType: 'CCCD' })),
    ).toThrow(RentalInvariantError);
    expect(() =>
      assertRentalConfirmation(
        confirm({
          collateralMethod: 'DOCUMENT',
          documentType: 'GPLX',
          collateralStatus: 'HELD',
          payments: [payment('200000.00')],
        }),
      ),
    ).not.toThrow();
  });

  it('uses configured late fee, item count and one threshold rental charge', () => {
    const configured = {
      ...policy,
      lateReturn: { feePerItemPerDay: 12345, newRentalChargeFromLateDay: 4 },
    };
    const dueAt = new Date('2026-10-10T00:00:00Z');
    const late = (days: number, itemCount = 2) =>
      calculateLateCharges({
        dueAt,
        returnedAt: new Date(dueAt.getTime() + days * 86400000),
        itemCount,
        rentalSubtotal: '200000.00',
        policy: configured,
      });
    expect(late(0)).toMatchObject({ lateDays: 0, lateFee: '0.00', additionalRental: '0.00' });
    expect(late(1, 1)).toMatchObject({ lateFee: '12345.00', additionalRental: '0.00' });
    expect(late(1, 3)).toMatchObject({ lateFee: '37035.00' });
    expect(late(4)).toMatchObject({ lateFee: '98760.00', additionalRental: '200000.00' });
    expect(late(5).additionalRental).toBe('200000.00');
  });

  it('earns customer loyalty only on configured completed-rental cycles', () => {
    const configured = {
      ...policy,
      loyalty: { ...policy.loyalty, rentalsRequired: 3, rewardRentalValue: 76543 },
    };
    expect(rewardForCompletedRental(0, configured)).toBe(0);
    expect(rewardForCompletedRental(1, configured)).toBe(0);
    expect(rewardForCompletedRental(2, configured)).toBe(76543);
    expect(rewardForCompletedRental(5, configured)).toBe(76543);
    expect(
      rewardForCompletedRental(2, {
        ...configured,
        loyalty: { ...configured.loyalty, enabled: false },
      }),
    ).toBe(0);
  });
});
