import { zonedDateKey, zonedDayRange, zonedMonthRange } from '@common/utils/timezone';

describe('timezone ranges', () => {
  it('builds Vietnam local-day bounds in UTC', () => {
    const range = zonedDayRange(new Date('2026-09-10T12:00:00Z'), 'Asia/Ho_Chi_Minh');
    expect(range.start.toISOString()).toBe('2026-09-09T17:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-10T17:00:00.000Z');
  });

  it('builds month bounds using the shop timezone', () => {
    const range = zonedMonthRange(new Date('2026-09-10T12:00:00Z'), 'Asia/Ho_Chi_Minh');
    expect(range.start.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });

  it('uses the local calendar date rather than the UTC date for occurrence identity', () => {
    expect(zonedDateKey(new Date('2026-09-22T16:59:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-09-22',
    );
    expect(zonedDateKey(new Date('2026-09-22T17:00:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe(
      '2026-09-23',
    );
  });
});
