import {
  assertRentalReschedule,
  canTransitionRental,
} from '../../src/modules/rentals/domain/rental-policy';

describe('Rental booking invariants', () => {
  const schedule = {
    createdAt: new Date('2026-09-01T03:00:00Z'),
    rentalStartAt: new Date('2026-09-03T03:00:00Z'),
    rentalEndAt: new Date('2026-09-05T03:00:00Z'),
    from: new Date('2026-09-21T03:00:00Z'),
    until: new Date('2026-09-23T03:00:00Z'),
    maxDaysFromBooking: 20,
  };

  it('allows cancellation only before confirmation', () => {
    expect(canTransitionRental('RESERVED', 'CANCELLED')).toBe(true);
    for (const state of ['CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED']) {
      expect(canTransitionRental(state, 'CANCELLED')).toBe(false);
    }
  });

  it('allows the inclusive policy deadline from the original booking instant', () => {
    expect(() => assertRentalReschedule(schedule)).not.toThrow();
  });

  it('rejects one millisecond beyond the deadline', () => {
    expect(() =>
      assertRentalReschedule({
        ...schedule,
        from: new Date(schedule.from.getTime() + 1),
        until: new Date(schedule.until.getTime() + 1),
      }),
    ).toThrow('The new rental start is outside the booking policy window');
  });

  it('honors a custom shop limit instead of a hardcoded default', () => {
    expect(() => assertRentalReschedule({ ...schedule, maxDaysFromBooking: 10 })).toThrow(
      'The new rental start is outside the booking policy window',
    );
  });

  it('rejects a start before the original booking', () => {
    expect(() =>
      assertRentalReschedule({
        ...schedule,
        from: new Date('2026-08-30T03:00:00Z'),
        until: new Date('2026-09-01T03:00:00Z'),
      }),
    ).toThrow('The new rental start is outside the booking policy window');
  });

  it('requires explicit repricing when duration changes', () => {
    expect(() =>
      assertRentalReschedule({ ...schedule, until: new Date('2026-09-24T03:00:00Z') }),
    ).toThrow('Changing rental duration requires repricing');
  });

  it.each([new Date('invalid'), schedule.from, new Date('2026-09-20T03:00:00Z')])(
    'rejects invalid intervals before persistence',
    (until) => {
      expect(() => assertRentalReschedule({ ...schedule, until })).toThrow(
        'Invalid rental interval',
      );
    },
  );
});
