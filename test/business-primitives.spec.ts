import { Prisma } from '@prisma/client';
import { decimalToNumber } from '../src/database/prisma/decimal-mapping';
import { generateDatedReference } from '../src/common/utils/reference-number';
import type { Clock } from '../src/common/clock/clock';
import { SystemClock } from '../src/common/clock/system-clock';
import {
  canRescheduleRental,
  calculateRentalDurationDays,
} from '../src/modules/rentals/domain/rental-policy';
import { InvalidRentalIntervalError } from '../src/modules/rentals/domain/rental-errors';
import { calculateOrderPaymentState } from '../src/modules/finance/domain/payment-state';
import { ReminderService } from '../src/modules/reminders/application/reminder.service';
import type {
  ReminderRepository,
  ReminderOrderCandidate,
} from '../src/modules/reminders/domain/reminder.repository';
import { DashboardService } from '../src/modules/dashboard/application/dashboard.service';
import type { DashboardRepository } from '../src/modules/dashboard/domain/dashboard.repository';
import { ReportService } from '../src/modules/reports/application/report.service';
import type { ReportRepository } from '../src/modules/reports/domain/report.repository';
import type { CurrentUser } from '../src/common/types/current-user';

const now = new Date('2026-09-11T03:00:00Z');
const clock: Clock = { now: () => new Date(now) };
const user: CurrentUser = {
  userId: 'user',
  memberId: 'member',
  shopId: 'shop',
  email: null,
  fullName: 'Admin',
  permissions: [],
};

describe('business primitives', () => {
  it.each(['RESERVED', 'CONFIRMED'])('allows rescheduling %s as before', (status) => {
    expect(canRescheduleRental(status)).toBe(true);
  });
  it.each(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'UNKNOWN'])(
    'rejects rescheduling %s as before',
    (status) => {
      expect(canRescheduleRental(status)).toBe(false);
    },
  );
  it('uses a typed interval error with the same existing message', () => {
    expect(() => calculateRentalDurationDays(now, now)).toThrow(InvalidRentalIntervalError);
    expect(() => calculateRentalDurationDays(new Date('invalid'), now)).toThrow(
      'Khoảng thời gian thuê không hợp lệ.',
    );
    expect(calculateRentalDurationDays(now, new Date(now.getTime() + 86400001))).toBe(2);
  });
  it('converts Decimal only where numbers were already exposed, without implicit rounding', () => {
    const amount = new Prisma.Decimal('50000.25');
    expect(decimalToNumber(amount)).toBe(50000.25);
    expect(decimalToNumber(new Prisma.Decimal(0))).toBe(0);
    expect(decimalToNumber(0)).toBe(0);
    expect(JSON.stringify({ amount, computed: decimalToNumber(amount), absent: null })).toBe(
      '{"amount":"50000.25","computed":50000.25,"absent":null}',
    );
  });
  it.each(['RT', 'PAY', 'EXP'] as const)(
    'preserves the %s reference format and UTC date',
    (prefix) => {
      jest.useFakeTimers().setSystemTime(now);
      try {
        expect(generateDatedReference(prefix)).toMatch(
          new RegExp('^' + prefix + '-20260911-[0-9A-F]{6}$'),
        );
        expect(new SystemClock().now()).toEqual(now);
      } finally {
        jest.useRealTimers();
      }
    },
  );
  it.each([
    [0, 0, 'PAID'],
    [50000, 0, 'UNPAID'],
    [50000, 25000, 'PARTIALLY_PAID'],
    [50000, 50000, 'PAID'],
    [50000, 60000, 'PAID'],
  ])('preserves payment threshold for total %s and paid %s', (total, paid, expected) => {
    expect(
      calculateOrderPaymentState({
        grandTotal: Number(total),
        depositRequired: 0,
        transactions: [{ amount: Number(paid), direction: 'IN', purpose: 'RENTAL_PAYMENT' }],
      }),
    ).toEqual({ paymentStatus: expected, depositStatus: 'NOT_REQUIRED' });
  });
  it('keeps refund precedence and partial deposit refunds', () => {
    expect(
      calculateOrderPaymentState({
        grandTotal: 0,
        depositRequired: 200000,
        transactions: [
          { amount: 50000, direction: 'IN', purpose: 'RENTAL_PAYMENT' },
          { amount: 50000, direction: 'OUT', purpose: 'ORDER_REFUND' },
          { amount: 200000, direction: 'IN', purpose: 'DEPOSIT' },
          { amount: 30000, direction: 'OUT', purpose: 'DEPOSIT_REFUND' },
        ],
      }),
    ).toEqual({ paymentStatus: 'REFUNDED', depositStatus: 'PARTIALLY_REFUNDED' });
  });
});

describe('business Clock consumers', () => {
  it('classifies overdue against the injected instant with a strict end boundary', async () => {
    const candidate: ReminderOrderCandidate = {
      id: 'late',
      orderNumber: 'RT-1',
      status: 'ACTIVE',
      paymentStatus: 'PAID',
      depositStatus: 'HELD',
      depositRequired: 200000,
      rentalStartAt: new Date('2026-09-10T03:00:00Z'),
      rentalEndAt: new Date(now.getTime() - 1),
      customerId: 'customer',
      customerName: 'Customer',
      customerPhone: '0900000000',
    };
    const repository: jest.Mocked<ReminderRepository> = {
      activeShops: jest.fn().mockResolvedValue([{ id: 'shop', timezone: 'Asia/Ho_Chi_Minh' }]),
      candidates: jest
        .fn()
        .mockResolvedValue([candidate, { ...candidate, id: 'exact', rentalEndAt: now }]),
      upsert: jest.fn().mockResolvedValue(undefined),
      resolveMissing: jest.fn().mockResolvedValue(undefined),
      list: jest.fn(),
      dismiss: jest.fn(),
    };
    await new ReminderService(repository, clock).refreshForUser(user);
    const overdue = repository.upsert.mock.calls
      .map(([value]) => value)
      .filter((value) => value.type === 'OVERDUE');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({
      shopId: 'shop',
      orderId: 'late',
      scheduledFor: now,
      priority: 100,
    });
    expect(
      repository.upsert.mock.calls.filter(([value]) => value.type === 'RETURN_TODAY'),
    ).toHaveLength(2);
  });
  it('uses shop-local day/month boundaries with the same captured dashboard instant', async () => {
    const failure = new Error('stop before persistence');
    const repository: jest.Mocked<DashboardRepository> = {
      getShopTimezone: jest.fn().mockResolvedValue('Asia/Ho_Chi_Minh'),
      summary: jest.fn().mockRejectedValue(failure),
    };
    await expect(new DashboardService(repository, clock).summary(user)).rejects.toBe(failure);
    expect(repository.summary.mock.calls[0]?.[0]).toEqual({
      shopId: 'shop',
      now,
      dayStart: new Date('2026-09-10T17:00:00Z'),
      dayEnd: new Date('2026-09-11T17:00:00Z'),
      monthStart: new Date('2026-08-31T17:00:00Z'),
      monthEnd: new Date('2026-09-30T17:00:00Z'),
      timezone: 'Asia/Ho_Chi_Minh',
      seriesStart: new Date('2026-09-04T17:00:00Z'),
    });
  });
  it('defaults reports to exactly the preceding 30 days and preserves explicit offsets', async () => {
    const repository: jest.Mocked<ReportRepository> = {
      shopTimezone: jest.fn().mockResolvedValue('Asia/Ho_Chi_Minh'),
      revenue: jest.fn().mockResolvedValue([]),
      productPerformance: jest.fn().mockResolvedValue([]),
      customerPerformance: jest.fn().mockResolvedValue([]),
    };
    const service = new ReportService(repository, clock);
    await service.revenue(user, {});
    expect(repository.revenue.mock.calls[0]?.[0]).toMatchObject({
      from: new Date(now.getTime() - 30 * 86400000),
      until: now,
    });
    await service.revenue(user, {
      from: '2026-09-10T10:00:00+07:00',
      until: '2026-09-11T10:00:00+07:00',
    });
    expect(repository.revenue.mock.calls[1]?.[0]).toMatchObject({
      from: new Date('2026-09-10T03:00:00Z'),
      until: now,
    });
  });
});
