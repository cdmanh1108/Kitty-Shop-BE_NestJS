import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import { canTransitionRental } from '../../src/modules/rentals/domain/rental-policy';

import {
  calculateLateCharges,
  rewardForCompletedRental,
} from '../../src/modules/rentals/domain/rental-settlement';

const policy = DEFAULT_RENTAL_POLICY;
describe('rental lifecycle policy', () => {
  it('never starts RESERVED directly; only CONFIRMED may start', () => {
    expect(canTransitionRental('RESERVED', 'ACTIVE')).toBe(false);
    expect(canTransitionRental('CONFIRMED', 'ACTIVE')).toBe(true);
    expect(canTransitionRental('ACTIVE', 'ACTIVE')).toBe(false);
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
