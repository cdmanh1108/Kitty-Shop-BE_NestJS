import { Logger } from '@nestjs/common';
import type { Clock } from '../../src/common/clock/clock';
import type { CurrentUser } from '../../src/common/types/current-user';
import {
  REMINDER_CANDIDATE_BATCH_SIZE,
  ReminderService,
} from '../../src/modules/reminders/application/reminder.service';
import type {
  ReminderOrderCandidate,
  ReminderRepository,
} from '../../src/modules/reminders/domain/reminder.repository';
import { immediatelyAcquireReminderRefresh } from '../helpers/reminder-refresh-coordinator';

const now = new Date('2026-09-22T03:00:00.000Z');
const clock: Clock = { now: () => new Date(now) };
const user: CurrentUser = {
  userId: 'user-1',
  memberId: 'member-1',
  shopId: 'shop-1',
  email: null,
  fullName: 'Admin',
  permissions: [],
};

function candidate(id: string): ReminderOrderCandidate {
  return {
    id,
    orderNumber: `RT-${id}`,
    status: 'RESERVED',
    paymentStatus: 'UNPAID',
    depositStatus: 'PENDING',
    depositRequired: 100000,
    rentalStartAt: new Date('2026-09-22T05:00:00.000Z'),
    rentalEndAt: new Date('2026-09-23T05:00:00.000Z'),
    customerId: `customer-${id}`,
    customerName: 'Customer',
    customerPhone: '0900000000',
  };
}

function repository(candidatePage: jest.MockedFunction<ReminderRepository['candidatePage']>): {
  persistence: jest.Mocked<ReminderRepository>;
  upsert: jest.MockedFunction<ReminderRepository['upsert']>;
  resolveMissing: jest.MockedFunction<ReminderRepository['resolveMissing']>;
} {
  const upsert = jest
    .fn<ReturnType<ReminderRepository['upsert']>, Parameters<ReminderRepository['upsert']>>()
    .mockResolvedValue(undefined);
  const resolveMissing = jest
    .fn<
      ReturnType<ReminderRepository['resolveMissing']>,
      Parameters<ReminderRepository['resolveMissing']>
    >()
    .mockResolvedValue(2);
  return {
    persistence: {
      activeShops: jest.fn().mockResolvedValue([{ id: user.shopId, timezone: 'Asia/Ho_Chi_Minh' }]),
      candidatePage,
      upsert,
      resolveMissing,
      list: jest.fn(),
      dismiss: jest.fn(),
    },
    upsert,
    resolveMissing,
  };
}

describe('Reminder refresh pagination', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses one captured workset window across sequential pages and resolves only after completion', async () => {
    const candidatePage = jest
      .fn<
        ReturnType<ReminderRepository['candidatePage']>,
        Parameters<ReminderRepository['candidatePage']>
      >()
      .mockResolvedValueOnce({ items: [candidate('order-1')], nextCursor: 'order-1' })
      .mockResolvedValueOnce({ items: [candidate('order-2')], nextCursor: null });
    const { persistence, resolveMissing } = repository(candidatePage);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await new ReminderService(
      persistence,
      clock,
      immediatelyAcquireReminderRefresh(),
    ).refreshForUser(user);

    expect(candidatePage).toHaveBeenCalledTimes(2);
    const [first, second] = candidatePage.mock.calls.map(([input]) => input);
    expect(first).toMatchObject({
      shopId: user.shopId,
      now,
      limit: REMINDER_CANDIDATE_BATCH_SIZE,
      cursor: undefined,
    });
    expect(second).toMatchObject({ now, cursor: 'order-1' });
    expect(resolveMissing).toHaveBeenCalledTimes(1);
    expect(resolveMissing).toHaveBeenCalledWith(
      user.shopId,
      expect.arrayContaining([
        'PICKUP_TODAY:order-1:2026-09-22',
        'PAYMENT_DUE:order-1:2026-09-22',
        'DEPOSIT_DUE:order-1:2026-09-22',
        'PICKUP_TODAY:order-2:2026-09-22',
      ]),
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'reminders.refresh.completed',
        shopId: user.shopId,
        pages: 2,
        candidateOrders: 2,
        reminderUpserts: 6,
        batchSize: REMINDER_CANDIDATE_BATCH_SIZE,
        resolvedCount: 2,
      }),
    );
  });

  it('does not resolve missing reminders after an incomplete page scan', async () => {
    const failure = new Error('page two failed');
    const candidatePage = jest
      .fn<
        ReturnType<ReminderRepository['candidatePage']>,
        Parameters<ReminderRepository['candidatePage']>
      >()
      .mockResolvedValueOnce({ items: [candidate('order-1')], nextCursor: 'order-1' })
      .mockRejectedValueOnce(failure);
    const { persistence, upsert, resolveMissing } = repository(candidatePage);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await new ReminderService(persistence, clock, immediatelyAcquireReminderRefresh()).refreshAll();

    expect(upsert).toHaveBeenCalled();
    expect(resolveMissing).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'reminders.refresh.failed',
        shopId: user.shopId,
        error: failure,
      }),
    );
  });
});
