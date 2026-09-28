import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { Clock } from '../../src/common/clock/clock';
import type { AppConfiguration } from '../../src/config/configuration';
import { AuthCleanupService } from '../../src/modules/auth-cleanup/application/auth-cleanup.service';
import type {
  AuthCleanupCoordinator,
  AuthCleanupOwnership,
} from '../../src/modules/auth-cleanup/domain/auth-cleanup-coordinator';
import type { AuthCleanupRepository } from '../../src/modules/auth-cleanup/domain/auth-cleanup.repository';

const clock: Clock = { now: () => new Date('2026-09-28T00:00:00.000Z') };

function config(enabled = true, batchSize = 2): ConfigService<AppConfiguration, true> {
  const value = new ConfigService<AppConfiguration, true>();
  value.set('authCleanup', {
    enabled,
    refreshTokenRetentionDays: 30,
    otpRetentionHours: 24,
    batchSize,
  });
  return value;
}

function coordinator(acquired = true): AuthCleanupCoordinator {
  return {
    async runIfOwner<T>(
      work: (ownership: AuthCleanupOwnership) => Promise<T>,
    ): Promise<
      | { acquired: true; value: T; acquireDurationMs: number }
      | { acquired: false; acquireDurationMs: number }
    > {
      if (!acquired) return { acquired: false, acquireDurationMs: 1 };
      return {
        acquired: true,
        value: await work({ assertActive: jest.fn() }),
        acquireDurationMs: 1,
      };
    },
  };
}

function repository(): jest.Mocked<AuthCleanupRepository> {
  return {
    purgeAdminRefreshTokenFamilies: jest.fn(),
    purgeWebRefreshTokenFamilies: jest.fn(),
    purgeWebOtpChallenges: jest.fn(),
  };
}

describe('AuthCleanupService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('drains bounded batches and makes a second run idempotent', async () => {
    const persistence = repository();
    persistence.purgeAdminRefreshTokenFamilies.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    persistence.purgeWebRefreshTokenFamilies.mockResolvedValue(0);
    persistence.purgeWebOtpChallenges.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const service = new AuthCleanupService(persistence, coordinator(), clock, config());

    await expect(service.cleanupNow()).resolves.toEqual({
      adminRefreshFamiliesDeleted: 3,
      webRefreshFamiliesDeleted: 0,
      otpChallengesDeleted: 3,
      batches: 4,
    });
    persistence.purgeAdminRefreshTokenFamilies.mockResolvedValue(0);
    persistence.purgeWebOtpChallenges.mockResolvedValue(0);
    await expect(service.cleanupNow()).resolves.toEqual({
      adminRefreshFamiliesDeleted: 0,
      webRefreshFamiliesDeleted: 0,
      otpChallengesDeleted: 0,
      batches: 0,
    });
  });

  it('does not run when disabled or when another replica owns the lease', async () => {
    const persistence = repository();
    const disabled = new AuthCleanupService(persistence, coordinator(), clock, config(false));
    await expect(disabled.cleanupNow()).resolves.toBeNull();
    expect(persistence.purgeAdminRefreshTokenFamilies.mock.calls).toHaveLength(0);

    const busy = new AuthCleanupService(persistence, coordinator(false), clock, config());
    await expect(busy.cleanupNow()).resolves.toBeNull();
  });

  it('logs scheduler failures without leaking or crashing the process', async () => {
    const persistence = repository();
    persistence.purgeAdminRefreshTokenFamilies.mockRejectedValue(new Error('database unavailable'));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new AuthCleanupService(persistence, coordinator(), clock, config());

    await expect(service.cleanupScheduled()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.cleanup.failed',
        phase: 'admin_refresh_families',
        errorClass: 'AuthCleanupPhaseError',
      }),
    );
  });
});
