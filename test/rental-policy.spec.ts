import { calculateRentalDurationDays } from '@modules/rentals/domain/rental-policy';

describe('calculateRentalDurationDays', () => {
  it('uses ceiling semantics for partial days', () => {
    expect(calculateRentalDurationDays(new Date('2026-09-10T03:00:00Z'), new Date('2026-09-11T04:00:00Z'))).toBe(2);
  });

  it('treats an exact 24 hour rental as one day', () => {
    expect(calculateRentalDurationDays(new Date('2026-09-10T03:00:00Z'), new Date('2026-09-11T03:00:00Z'))).toBe(1);
  });

  it('rejects invalid intervals', () => {
    expect(() => calculateRentalDurationDays(new Date('2026-09-11T03:00:00Z'), new Date('2026-09-10T03:00:00Z'))).toThrow();
  });
});
