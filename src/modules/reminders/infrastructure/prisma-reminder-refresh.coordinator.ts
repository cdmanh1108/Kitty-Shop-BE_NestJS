import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  ReminderRefreshOwnershipLostError,
  type ReminderRefreshCoordinationResult,
  type ReminderRefreshCoordinator,
  type ReminderRefreshOwnership,
} from '../domain/reminder-refresh-coordinator';

export const REMINDER_REFRESH_JOB_NAMESPACE = 'reminders.refresh';
export const REMINDER_REFRESH_LEASE_MS = 2 * 60 * 1000;
export const REMINDER_REFRESH_LEASE_RENEWAL_MS = 30 * 1000;

type LeaseRow = { job_key: string };

function asError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage, { cause: error });
}

/**
 * Coordinates one complete C39 shop refresh through an owner-token-fenced DB lease.
 * It deliberately uses short, independent statements instead of session advisory
 * locks, so it does not require session affinity from a database proxy.
 */
@Injectable()
export class PrismaReminderRefreshCoordinator implements ReminderRefreshCoordinator {
  private readonly logger = new Logger(PrismaReminderRefreshCoordinator.name);
  private readonly locallyHeldKeys = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async runIfOwner<T>(
    shopId: string,
    work: (ownership: ReminderRefreshOwnership) => Promise<T>,
  ): Promise<ReminderRefreshCoordinationResult<T>> {
    const jobKey = `${REMINDER_REFRESH_JOB_NAMESPACE}:${shopId}`;
    const acquireStartedAt = Date.now();
    if (this.locallyHeldKeys.has(jobKey)) {
      return { acquired: false, acquireDurationMs: Date.now() - acquireStartedAt };
    }

    this.locallyHeldKeys.add(jobKey);
    const ownerToken = randomUUID();
    try {
      const acquired = await this.tryAcquire(jobKey, ownerToken);
      const acquireDurationMs = Date.now() - acquireStartedAt;
      if (!acquired) return { acquired: false, acquireDurationMs };

      let ownershipFailure: ReminderRefreshOwnershipLostError | undefined;
      let pendingRenewal: Promise<void> | undefined;
      const renew = (): void => {
        if (pendingRenewal || ownershipFailure) return;
        pendingRenewal = this.renew(jobKey, ownerToken)
          .then((renewed) => {
            if (!renewed) ownershipFailure = new ReminderRefreshOwnershipLostError();
          })
          .catch((error: unknown) => {
            ownershipFailure = new ReminderRefreshOwnershipLostError(
              asError(error, 'Reminder refresh lease renewal failed.'),
            );
          })
          .finally(() => {
            pendingRenewal = undefined;
          });
      };
      const renewalTimer = setInterval(renew, REMINDER_REFRESH_LEASE_RENEWAL_MS);
      renewalTimer.unref();
      const ownership = {
        assertActive: (): void => {
          if (ownershipFailure) throw ownershipFailure;
        },
      };

      let value: T | undefined;
      let workError: unknown;
      try {
        value = await work(ownership);
        ownership.assertActive();
      } catch (error: unknown) {
        workError = error;
      } finally {
        clearInterval(renewalTimer);
        await pendingRenewal;
      }

      let releaseError: unknown;
      try {
        const released = await this.release(jobKey, ownerToken);
        if (!released && !ownershipFailure)
          ownershipFailure = new ReminderRefreshOwnershipLostError();
      } catch (error: unknown) {
        releaseError = error;
        this.logger.error({
          event: 'reminders.refresh.lease_release_failed',
          jobKey,
          error: error instanceof Error ? error : new Error('Unknown lease release error.'),
        });
      }

      if (workError) throw asError(workError, 'Reminder refresh work failed.');
      if (ownershipFailure) throw ownershipFailure;
      if (releaseError) throw asError(releaseError, 'Reminder refresh lease release failed.');
      return { acquired: true, value: value as T, acquireDurationMs };
    } finally {
      this.locallyHeldKeys.delete(jobKey);
    }
  }

  private async tryAcquire(jobKey: string, ownerToken: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<LeaseRow[]>`
      INSERT INTO "scheduler_job_leases" ("job_key", "owner_token", "lease_until", "acquired_at", "updated_at")
      VALUES (
        ${jobKey},
        ${ownerToken},
        CURRENT_TIMESTAMP + (${REMINDER_REFRESH_LEASE_MS} * INTERVAL '1 millisecond'),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("job_key") DO UPDATE
      SET
        "owner_token" = EXCLUDED."owner_token",
        "lease_until" = EXCLUDED."lease_until",
        "acquired_at" = EXCLUDED."acquired_at",
        "updated_at" = EXCLUDED."updated_at"
      WHERE "scheduler_job_leases"."lease_until" <= CURRENT_TIMESTAMP
      RETURNING "job_key"
    `;
    return rows.length === 1;
  }

  private async renew(jobKey: string, ownerToken: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<LeaseRow[]>`
      UPDATE "scheduler_job_leases"
      SET
        "lease_until" = CURRENT_TIMESTAMP + (${REMINDER_REFRESH_LEASE_MS} * INTERVAL '1 millisecond'),
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "job_key" = ${jobKey} AND "owner_token" = ${ownerToken}
      RETURNING "job_key"
    `;
    return rows.length === 1;
  }

  private async release(jobKey: string, ownerToken: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<LeaseRow[]>`
      DELETE FROM "scheduler_job_leases"
      WHERE "job_key" = ${jobKey} AND "owner_token" = ${ownerToken}
      RETURNING "job_key"
    `;
    return rows.length === 1;
  }
}
