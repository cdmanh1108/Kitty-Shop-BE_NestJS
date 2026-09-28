import { ClockModule } from '@common/clock/clock.module';
import { Module } from '@nestjs/common';
import { AuthCleanupService } from './application/auth-cleanup.service';
import { AUTH_CLEANUP_COORDINATOR } from './domain/auth-cleanup-coordinator';
import { AUTH_CLEANUP_REPOSITORY } from './domain/auth-cleanup.repository';
import { PrismaAuthCleanupCoordinator } from './infrastructure/prisma-auth-cleanup.coordinator';
import { PrismaAuthCleanupRepository } from './infrastructure/prisma-auth-cleanup.repository';

@Module({
  imports: [ClockModule],
  providers: [
    AuthCleanupService,
    PrismaAuthCleanupRepository,
    PrismaAuthCleanupCoordinator,
    { provide: AUTH_CLEANUP_REPOSITORY, useExisting: PrismaAuthCleanupRepository },
    { provide: AUTH_CLEANUP_COORDINATOR, useExisting: PrismaAuthCleanupCoordinator },
  ],
})
export class AuthCleanupModule {}
