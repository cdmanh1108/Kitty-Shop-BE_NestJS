import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import { AuthCleanupService } from '../../application/auth-cleanup.service';

@Injectable()
export class AuthCleanupJob {
  private readonly logger = new Logger(AuthCleanupJob.name);

  constructor(
    private readonly cleanupService: AuthCleanupService,
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {}

  @Cron('0 15 3 * * *')
  async execute(): Promise<void> {
    if (!this.config.get('authCleanup', { infer: true }).enabled) return;

    const startedAt = Date.now();
    try {
      const result = await this.cleanupService.cleanupNow();
      if (!result) {
        this.logger.log({ event: 'auth.cleanup.skipped_busy', coordinationMode: 'database_lease' });
        return;
      }
      this.logger.log({
        event: 'auth.cleanup.completed',
        ...result,
        durationMs: Date.now() - startedAt,
        coordinationMode: 'database_lease',
      });
    } catch (error) {
      this.logger.error({
        event: 'auth.cleanup.failed',
        durationMs: Date.now() - startedAt,
        phase: error instanceof Error && 'phase' in error ? error.phase : 'lease_or_orchestration',
        errorClass: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
    }
  }
}
