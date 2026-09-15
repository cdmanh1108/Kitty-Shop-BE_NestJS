import { resolveFinancePeriod } from '../../src/modules/finance/application/finance-read.service';
const now = new Date('2026-09-15T18:00:00Z');
const zone = 'Asia/Ho_Chi_Minh';
describe('Finance business periods', () => {
  it.each([
    ['today', '2026-09-15T17:00:00.000Z', '2026-09-16T17:00:00.000Z'],
    ['week', '2026-09-13T17:00:00.000Z', '2026-09-20T17:00:00.000Z'],
    ['month', '2026-08-31T17:00:00.000Z', '2026-09-30T17:00:00.000Z'],
  ] as const)('%s uses shop-local inclusive start/exclusive end', (preset, start, end) => {
    const result = resolveFinancePeriod({ preset }, now, zone);
    expect(result.start.toISOString()).toBe(start);
    expect(result.end.toISOString()).toBe(end);
  });
  it('includes both custom dates and resolves DST midnight independently', () => {
    const result = resolveFinancePeriod(
      { preset: 'custom', from: '2026-03-08', to: '2026-03-08' },
      now,
      'America/New_York',
    );
    expect(result.start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(result.period).toEqual({
      from: '2026-03-08',
      to: '2026-03-08',
      timezone: 'America/New_York',
    });
  });
  it.each([
    { preset: 'custom' },
    { preset: 'custom', from: '2026-02-30', to: '2026-03-01' },
    { preset: 'custom', from: '2026-09-20', to: '2026-09-01' },
    { preset: 'custom', from: '2025-01-01', to: '2026-09-01' },
    { preset: 'month', from: '2026-09-01' },
  ] as const)('rejects invalid or unbounded input %j', (filter) => {
    expect(() => resolveFinancePeriod(filter, now, zone)).toThrow();
  });
});
