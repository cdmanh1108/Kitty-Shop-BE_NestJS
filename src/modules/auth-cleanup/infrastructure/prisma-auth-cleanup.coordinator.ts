import { Injectable } from '@nestjs/common';
import { PrismaSchedulerJobLeaseCoordinator } from '@common/scheduling/prisma-scheduler-job-lease.coordinator';
import { PrismaService } from '@database/prisma/prisma.service';
import type {
  AuthCleanupCoordinationResult,
  AuthCleanupCoordinator,
  AuthCleanupOwnership,
} from '../domain/auth-cleanup-coordinator';

export const AUTH_CLEANUP_JOB_KEY = 'auth.cleanup';
export const AUTH_CLEANUP_LEASE_MS = 15 * 60 * 1000;

@Injectable()
export class PrismaAuthCleanupCoordinator implements AuthCleanupCoordinator {
  private readonly leases: PrismaSchedulerJobLeaseCoordinator;

  constructor(prisma: PrismaService) {
    this.leases = new PrismaSchedulerJobLeaseCoordinator(prisma, AUTH_CLEANUP_LEASE_MS);
  }

  runIfOwner<T>(
    work: (ownership: AuthCleanupOwnership) => Promise<T>,
  ): Promise<AuthCleanupCoordinationResult<T>> {
    return this.leases.runIfOwner(AUTH_CLEANUP_JOB_KEY, work);
  }
}
