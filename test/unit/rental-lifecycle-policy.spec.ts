import { DEFAULT_RENTAL_POLICY } from '../../src/modules/settings/domain/rental-policy';
import { canTransitionRental } from '../../src/modules/rentals/domain/rental-policy';

import { rewardForCompletedRental } from '../../src/modules/rentals/domain/rental-settlement';

const policy = DEFAULT_RENTAL_POLICY;
describe('rental lifecycle policy', () => {
  it('never starts RESERVED directly; only CONFIRMED may start', () => {
    expect(canTransitionRental('RESERVED', 'ACTIVE')).toBe(false);
    expect(canTransitionRental('CONFIRMED', 'ACTIVE')).toBe(true);
    expect(canTransitionRental('ACTIVE', 'ACTIVE')).toBe(false);
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
