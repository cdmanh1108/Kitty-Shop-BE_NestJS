import { Injectable, Logger } from '@nestjs/common';
import {
  PrismaSchedulerJobLeaseCoordinator,
  SchedulerJobLeaseOwnershipLostError,
} from '@common/scheduling/prisma-scheduler-job-lease.coordinator';
import { PrismaService } from '@database/prisma/prisma.service';
import {
  ReminderRefreshOwnershipLostError,
  type ReminderRefreshCoordinationResult,
  type ReminderRefreshCoordinator,
  type ReminderRefreshOwnership,
} from '../domain/reminder-refresh-coordinator';

export const REMINDER_REFRESH_JOB_NAMESPACE = 'reminders.refresh';
export const REMINDER_REFRESH_LEASE_MS = 2 * 60 * 1000;

/** Reuses the shared DB lease while retaining the reminder-specific domain contract. */
@Injectable()
export class PrismaReminderRefreshCoordinator implements ReminderRefreshCoordinator {
  private readonly logger = new Logger(PrismaReminderRefreshCoordinator.name);
  private readonly leases: PrismaSchedulerJobLeaseCoordinator;

  constructor(prisma: PrismaService) {
    this.leases = new PrismaSchedulerJobLeaseCoordinator(
      prisma,
      REMINDER_REFRESH_LEASE_MS,
      (jobKey, error) => {
        this.logger.error({ event: 'reminders.refresh.lease_release_failed', jobKey, error });
      },
    );
  }

  async runIfOwner<T>(
    shopId: string,
    work: (ownership: ReminderRefreshOwnership) => Promise<T>,
  ): Promise<ReminderRefreshCoordinationResult<T>> {
    try {
      return await this.leases.runIfOwner(`${REMINDER_REFRESH_JOB_NAMESPACE}:${shopId}`, work);
    } catch (error) {
      if (error instanceof SchedulerJobLeaseOwnershipLostError) {
        throw new ReminderRefreshOwnershipLostError(error);
      }
      throw error;
    }
  }
}
