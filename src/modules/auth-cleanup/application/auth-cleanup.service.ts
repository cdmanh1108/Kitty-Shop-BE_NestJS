import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CLOCK, type Clock } from '@common/clock/clock';
import type { AppConfiguration } from '@config/configuration';
import {
  AUTH_CLEANUP_COORDINATOR,
  type AuthCleanupCoordinator,
  type AuthCleanupOwnership,
} from '../domain/auth-cleanup-coordinator';
import {
  AUTH_CLEANUP_REPOSITORY,
  type AuthCleanupRepository,
} from '../domain/auth-cleanup.repository';

export interface AuthCleanupResult {
  adminRefreshFamiliesDeleted: number;
  webRefreshFamiliesDeleted: number;
  otpChallengesDeleted: number;
  batches: number;
}

class AuthCleanupPhaseError extends Error {
  constructor(
    readonly phase: 'admin_refresh_families' | 'web_refresh_families' | 'web_otp_challenges',
    cause: Error,
  ) {
    super(`Auth cleanup failed during ${phase}.`, { cause });
    this.name = AuthCleanupPhaseError.name;
  }
}

@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(
    @Inject(AUTH_CLEANUP_REPOSITORY) private readonly repository: AuthCleanupRepository,
    @Inject(AUTH_CLEANUP_COORDINATOR) private readonly coordinator: AuthCleanupCoordinator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {}

  @Cron('0 15 3 * * *')
  async cleanupScheduled(): Promise<void> {
    const cleanup = this.config.get('authCleanup', { infer: true });
    if (!cleanup.enabled) return;

    const startedAt = Date.now();
    try {
      const execution = await this.coordinator.runIfOwner((ownership) =>
        this.cleanupOwned(ownership),
      );
      if (!execution.acquired) {
        this.logger.log({ event: 'auth.cleanup.skipped_busy', coordinationMode: 'database_lease' });
        return;
      }
      this.logger.log({
        event: 'auth.cleanup.completed',
        ...execution.value,
        durationMs: Date.now() - startedAt,
        coordinationMode: 'database_lease',
      });
    } catch (error) {
      this.logger.error({
        event: 'auth.cleanup.failed',
        durationMs: Date.now() - startedAt,
        phase: error instanceof AuthCleanupPhaseError ? error.phase : 'lease_or_orchestration',
        errorClass: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
    }
  }

  /** Enables deterministic application and integration tests without invoking cron. */
  async cleanupNow(): Promise<AuthCleanupResult | null> {
    if (!this.config.get('authCleanup', { infer: true }).enabled) return null;
    const execution = await this.coordinator.runIfOwner((ownership) =>
      this.cleanupOwned(ownership),
    );
    return execution.acquired ? execution.value : null;
  }

  private async cleanupOwned(ownership: AuthCleanupOwnership): Promise<AuthCleanupResult> {
    const cleanup = this.config.get('authCleanup', { infer: true });
    const now = this.clock.now();
    const refreshCutoff = new Date(
      now.getTime() - cleanup.refreshTokenRetentionDays * 24 * 60 * 60 * 1000,
    );
    const otpCutoff = new Date(now.getTime() - cleanup.otpRetentionHours * 60 * 60 * 1000);
    const [adminRefreshFamiliesDeleted, adminBatches] = await this.purgePhase(
      ownership,
      'admin_refresh_families',
      () => this.repository.purgeAdminRefreshTokenFamilies(refreshCutoff, cleanup.batchSize),
      cleanup.batchSize,
    );
    const [webRefreshFamiliesDeleted, webBatches] = await this.purgePhase(
      ownership,
      'web_refresh_families',
      () => this.repository.purgeWebRefreshTokenFamilies(refreshCutoff, cleanup.batchSize),
      cleanup.batchSize,
    );
    const [otpChallengesDeleted, otpBatches] = await this.purgePhase(
      ownership,
      'web_otp_challenges',
      () => this.repository.purgeWebOtpChallenges(otpCutoff, cleanup.batchSize),
      cleanup.batchSize,
    );
    return {
      adminRefreshFamiliesDeleted,
      webRefreshFamiliesDeleted,
      otpChallengesDeleted,
      batches: adminBatches + webBatches + otpBatches,
    };
  }

  private async purgePhase(
    ownership: AuthCleanupOwnership,
    phase: AuthCleanupPhaseError['phase'],
    purge: () => Promise<number>,
    batchSize: number,
  ): Promise<[deleted: number, batches: number]> {
    try {
      return await this.purgeBatches(ownership, purge, batchSize);
    } catch (error) {
      throw new AuthCleanupPhaseError(
        phase,
        error instanceof Error ? error : new Error('Unknown cleanup phase failure.'),
      );
    }
  }

  private async purgeBatches(
    ownership: AuthCleanupOwnership,
    purge: () => Promise<number>,
    batchSize: number,
  ): Promise<[deleted: number, batches: number]> {
    let deleted = 0;
    let batches = 0;
    let hasFullBatch = true;
    while (hasFullBatch) {
      ownership.assertActive();
      const count = await purge();
      deleted += count;
      if (count === 0) return [deleted, batches];
      batches += 1;
      hasFullBatch = count === batchSize;
    }
    return [deleted, batches];
  }
}
