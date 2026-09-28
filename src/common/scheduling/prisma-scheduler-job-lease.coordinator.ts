import { randomUUID } from 'node:crypto';
import type { PrismaService } from '@database/prisma/prisma.service';

export interface SchedulerJobLeaseOwnership {
  assertActive(): void;
}

export type SchedulerJobLeaseResult<T> =
  | { acquired: true; value: T; acquireDurationMs: number }
  | { acquired: false; acquireDurationMs: number };

export class SchedulerJobLeaseOwnershipLostError extends Error {
  constructor(cause?: Error) {
    super('Scheduler job lease ownership was lost.', { cause });
    this.name = SchedulerJobLeaseOwnershipLostError.name;
  }
}

type LeaseRow = { job_key: string };

function asError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage, { cause: error });
}

/**
 * A database-backed, owner-token-fenced lease for periodic work shared by API replicas.
 * It uses independent statements, so it is safe with a transaction-pooling database proxy.
 */
export class PrismaSchedulerJobLeaseCoordinator {
  private readonly locallyHeldKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaseMs: number,
    private readonly onLeaseReleaseFailure?: (jobKey: string, error: Error) => void,
  ) {}

  async runIfOwner<T>(
    jobKey: string,
    work: (ownership: SchedulerJobLeaseOwnership) => Promise<T>,
  ): Promise<SchedulerJobLeaseResult<T>> {
    const startedAt = Date.now();
    if (this.locallyHeldKeys.has(jobKey)) {
      return { acquired: false, acquireDurationMs: Date.now() - startedAt };
    }

    this.locallyHeldKeys.add(jobKey);
    const ownerToken = randomUUID();
    try {
      const acquired = await this.tryAcquire(jobKey, ownerToken);
      const acquireDurationMs = Date.now() - startedAt;
      if (!acquired) return { acquired: false, acquireDurationMs };

      let ownershipFailure: SchedulerJobLeaseOwnershipLostError | undefined;
      let pendingRenewal: Promise<void> | undefined;
      const renewalMs = Math.max(1_000, Math.floor(this.leaseMs / 4));
      const renew = (): void => {
        if (pendingRenewal || ownershipFailure) return;
        pendingRenewal = this.renew(jobKey, ownerToken)
          .then((renewed) => {
            if (!renewed) ownershipFailure = new SchedulerJobLeaseOwnershipLostError();
          })
          .catch((error: unknown) => {
            ownershipFailure = new SchedulerJobLeaseOwnershipLostError(
              asError(error, 'Scheduler job lease renewal failed.'),
            );
          })
          .finally(() => {
            pendingRenewal = undefined;
          });
      };
      const renewalTimer = setInterval(renew, renewalMs);
      renewalTimer.unref();
      const ownership: SchedulerJobLeaseOwnership = {
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
          ownershipFailure = new SchedulerJobLeaseOwnershipLostError();
      } catch (error: unknown) {
        releaseError = error;
        this.onLeaseReleaseFailure?.(jobKey, asError(error, 'Scheduler job lease release failed.'));
      }

      if (workError) throw asError(workError, 'Scheduler job work failed.');
      if (ownershipFailure) throw ownershipFailure;
      if (releaseError) throw asError(releaseError, 'Scheduler job lease release failed.');
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
        CURRENT_TIMESTAMP + (${this.leaseMs} * INTERVAL '1 millisecond'),
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
        "lease_until" = CURRENT_TIMESTAMP + (${this.leaseMs} * INTERVAL '1 millisecond'),
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
