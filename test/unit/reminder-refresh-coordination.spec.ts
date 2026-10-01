import type { Clock } from '../../src/common/clock/clock';
import type { CurrentUser } from '../../src/common/types/current-user';
import { ReminderService } from '../../src/modules/reminders/application/reminder.service';
import { ReminderRefreshAlreadyRunningError } from '../../src/modules/reminders/application/reminder.errors';
import type { ReminderRefreshCoordinator } from '../../src/modules/reminders/domain/reminder-refresh-coordinator';
import type { ReminderRepository } from '../../src/modules/reminders/domain/reminder.repository';
import { applicationLoggerMock } from '../helpers/application-logger';

const user: CurrentUser = {
  userId: 'user-1',
  memberId: 'member-1',
  shopId: 'shop-1',
  email: null,
  fullName: 'Admin',
  permissions: [],
};
const clock: Clock = { now: () => new Date('2026-09-22T03:00:00.000Z') };

function repository(): jest.Mocked<ReminderRepository> {
  return {
    activeShops: jest.fn().mockResolvedValue([{ id: user.shopId, timezone: 'Asia/Ho_Chi_Minh' }]),
    candidatePage: jest.fn(),
    upsert: jest.fn(),
    resolveMissing: jest.fn(),
    list: jest.fn(),
    dismiss: jest.fn(),
  };
}

function busyCoordinator(): ReminderRefreshCoordinator {
  return {
    runIfOwner: jest.fn().mockResolvedValue({ acquired: false, acquireDurationMs: 1 }),
  } as unknown as ReminderRefreshCoordinator;
}

describe('Reminder refresh coordination', () => {
  afterEach(() => jest.restoreAllMocks());

  it('skips a busy shop in cron without reading its C39 candidate workset', async () => {
    const persistence = repository();
    const logger = applicationLoggerMock();

    await new ReminderService(persistence, clock, busyCoordinator(), logger.factory).refreshAll();

    expect(persistence.candidatePage.mock.calls).toHaveLength(0);
    expect(persistence.resolveMissing.mock.calls).toHaveLength(0);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'reminders.refresh.skipped_busy',
        shopId: user.shopId,
        coordinationMode: 'database_lease',
      }),
    );
  });

  it('returns a conflict for a manual refresh when another worker owns the shop', async () => {
    const persistence = repository();

    await expect(
      new ReminderService(persistence, clock, busyCoordinator()).refreshForUser(user),
    ).rejects.toBeInstanceOf(ReminderRefreshAlreadyRunningError);
    expect(persistence.candidatePage.mock.calls).toHaveLength(0);
  });

  it('logs an acquisition infrastructure failure as a refresh failure, not a busy skip', async () => {
    const persistence = repository();
    const failure = new Error('database unavailable');
    const coordinator = {
      runIfOwner: jest.fn().mockRejectedValue(failure),
    } as unknown as ReminderRefreshCoordinator;
    const logger = applicationLoggerMock();

    await new ReminderService(persistence, clock, coordinator, logger.factory).refreshAll();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'reminders.refresh.failed',
        shopId: user.shopId,
        error: failure,
      }),
    );
    expect(logger.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'reminders.refresh.skipped_busy' }),
    );
  });
});
