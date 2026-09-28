import type {
  SchedulerJobLeaseOwnership,
  SchedulerJobLeaseResult,
} from '@common/scheduling/prisma-scheduler-job-lease.coordinator';

export type AuthCleanupOwnership = SchedulerJobLeaseOwnership;
export type AuthCleanupCoordinationResult<T> = SchedulerJobLeaseResult<T>;

export interface AuthCleanupCoordinator {
  runIfOwner<T>(
    work: (ownership: AuthCleanupOwnership) => Promise<T>,
  ): Promise<AuthCleanupCoordinationResult<T>>;
}

export const AUTH_CLEANUP_COORDINATOR = Symbol('AUTH_CLEANUP_COORDINATOR');
