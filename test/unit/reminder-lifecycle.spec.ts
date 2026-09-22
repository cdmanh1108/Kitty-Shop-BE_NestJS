import type { Clock } from '../../src/common/clock/clock';
import type { CurrentUser } from '../../src/common/types/current-user';
import { ReminderService } from '../../src/modules/reminders/application/reminder.service';
import type { ReminderRepository } from '../../src/modules/reminders/domain/reminder.repository';

const user: CurrentUser = {
  userId: 'user-1',
  memberId: 'member-1',
  shopId: 'shop-1',
  email: null,
  fullName: 'Admin',
  permissions: [],
};

describe('Reminder logical occurrence lifecycle', () => {
  it('keeps dismissal for the same shop-local day and creates a new pending occurrence on the next day', async () => {
    let now = new Date('2026-09-22T16:59:00.000Z'); // 23:59 in Asia/Ho_Chi_Minh
    const rows = new Map<string, { status: 'PENDING' | 'DISMISSED' | 'RESOLVED' }>();
    const repository: jest.Mocked<ReminderRepository> = {
      activeShops: jest.fn().mockResolvedValue([{ id: user.shopId, timezone: 'Asia/Ho_Chi_Minh' }]),
      candidates: jest.fn().mockResolvedValue([
        {
          id: 'order-1',
          orderNumber: 'RT-1',
          status: 'RESERVED',
          paymentStatus: 'UNPAID',
          depositStatus: 'HELD',
          depositRequired: 0,
          rentalStartAt: new Date('2026-09-25T03:00:00.000Z'),
          rentalEndAt: new Date('2026-09-26T03:00:00.000Z'),
          customerId: 'customer-1',
          customerName: 'Customer',
          customerPhone: '0900000000',
        },
      ]),
      upsert: jest.fn((input) => {
        if (!rows.has(input.dedupeKey)) rows.set(input.dedupeKey, { status: 'PENDING' });
        return Promise.resolve();
      }),
      resolveMissing: jest.fn().mockResolvedValue(undefined),
      list: jest.fn(),
      dismiss: jest.fn(),
    };
    const clock: Clock = { now: () => new Date(now) };
    const service = new ReminderService(repository, clock);

    await service.refreshForUser(user);
    const firstKey = 'PAYMENT_DUE:order-1:2026-09-22';
    rows.set(firstKey, { status: 'DISMISSED' });
    await service.refreshForUser(user);

    expect(rows.get(firstKey)).toEqual({ status: 'DISMISSED' });
    expect(rows.size).toBe(1);

    now = new Date('2026-09-22T17:00:00.000Z'); // midnight, next shop-local day
    await service.refreshForUser(user);

    expect(rows.get(firstKey)).toEqual({ status: 'DISMISSED' });
    expect(rows.get('PAYMENT_DUE:order-1:2026-09-23')).toEqual({ status: 'PENDING' });
  });

  it('does not revive a resolved occurrence when the same key is refreshed again', async () => {
    const rows = new Map<string, { status: 'PENDING' | 'DISMISSED' | 'RESOLVED' }>();
    const repository: jest.Mocked<ReminderRepository> = {
      activeShops: jest.fn().mockResolvedValue([{ id: user.shopId, timezone: 'Asia/Ho_Chi_Minh' }]),
      candidates: jest.fn().mockResolvedValue([
        {
          id: 'order-1',
          orderNumber: 'RT-1',
          status: 'RESERVED',
          paymentStatus: 'UNPAID',
          depositStatus: 'HELD',
          depositRequired: 0,
          rentalStartAt: new Date('2026-09-25T03:00:00.000Z'),
          rentalEndAt: new Date('2026-09-26T03:00:00.000Z'),
          customerId: 'customer-1',
          customerName: 'Customer',
          customerPhone: '0900000000',
        },
      ]),
      upsert: jest.fn((input) => {
        if (!rows.has(input.dedupeKey)) rows.set(input.dedupeKey, { status: 'PENDING' });
        return Promise.resolve();
      }),
      resolveMissing: jest.fn().mockResolvedValue(undefined),
      list: jest.fn(),
      dismiss: jest.fn(),
    };
    const service = new ReminderService(repository, {
      now: () => new Date('2026-09-22T03:00:00.000Z'),
    });

    await service.refreshForUser(user);
    const key = 'PAYMENT_DUE:order-1:2026-09-22';
    rows.set(key, { status: 'RESOLVED' });
    await service.refreshForUser(user);

    expect(rows.get(key)).toEqual({ status: 'RESOLVED' });
  });
});
