import type {
  ReminderRefreshCoordinationResult,
  ReminderRefreshCoordinator,
} from '../../src/modules/reminders/domain/reminder-refresh-coordinator';

/** Unit-test coordinator that enters the ownership boundary immediately. */
export function immediatelyAcquireReminderRefresh(): ReminderRefreshCoordinator {
  return {
    async runIfOwner<T>(
      _shopId: string,
      work: Parameters<ReminderRefreshCoordinator['runIfOwner']>[1],
    ): Promise<ReminderRefreshCoordinationResult<T>> {
      const value = await work({ assertActive: () => undefined });
      return { acquired: true, value: value as T, acquireDurationMs: 0 };
    },
  };
}
