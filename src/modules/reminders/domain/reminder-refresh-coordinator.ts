export const REMINDER_REFRESH_COORDINATOR = Symbol('REMINDER_REFRESH_COORDINATOR');

/**
 * The callback must call assertActive before each externally visible refresh boundary.
 * A lease can be lost if the database rejects a renewal; continuing the scan would no
 * longer satisfy the single-owner invariant.
 */
export interface ReminderRefreshOwnership {
  assertActive(): void;
}

export type ReminderRefreshCoordinationResult<T> =
  | {
      acquired: true;
      value: T;
      acquireDurationMs: number;
    }
  | {
      acquired: false;
      acquireDurationMs: number;
    };

export interface ReminderRefreshCoordinator {
  runIfOwner<T>(
    shopId: string,
    work: (ownership: ReminderRefreshOwnership) => Promise<T>,
  ): Promise<ReminderRefreshCoordinationResult<T>>;
}

export class ReminderRefreshOwnershipLostError extends Error {
  constructor(cause?: Error) {
    super('Đã mất quyền sở hữu khóa làm mới lời nhắc.', { cause });
    this.name = ReminderRefreshOwnershipLostError.name;
  }
}
