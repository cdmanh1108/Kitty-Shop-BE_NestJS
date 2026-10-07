import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Clock } from '../../src/common/clock/clock';
import type { AppConfiguration } from '../../src/config/configuration';
import { WebRegistrationService } from '../../src/modules/web-auth/application/web-registration.service';
import { WebSessionService } from '../../src/modules/web-auth/application/web-session.service';
import type {
  WebAuthRepository,
  WebAccount,
} from '../../src/modules/web-auth/domain/web-auth.repository';
import type {
  VerificationCodeGenerator,
  VerificationCodeSender,
} from '../../src/modules/web-auth/domain/verification-code';

export const now = new Date('2026-09-16T00:00:00Z');

export const testConfig = new ConfigService<AppConfiguration, true>({
  jwtAccessSecret: 'test-secret-at-least-thirty-two-characters',
  email: {
    resendApiKey: 're_test_only_not_a_real_key',
    fromAddress: 'no-reply@example.test',
    fromName: 'Kitty Test',
  },
  webAuth: {
    bypassEnabled: true,
    bypassCode: '123456',
    otpTtlSeconds: 300,
    otpMaxAttempts: 5,
    resendCooldownSeconds: 60,
    deliveryFailureRetrySeconds: 10,
    accessSecret: 'web-test-secret-at-least-thirty-two-characters',
    accessTtlSeconds: 900,
    refreshTokenTtlDays: 7,
    otpHashSecret: 'otp-test-secret-at-least-thirty-two-characters',
  },
});

export const testClock: Clock = { now: () => now };

export function testAccount(passwordHash: string, options: Partial<WebAccount> = {}): WebAccount {
  return {
    id: 'account',
    email: 'user@example.test',
    passwordHash,
    emailVerifiedAt: now,
    disabledAt: null,
    createdAt: now,
    ...options,
  };
}

export function webAuthRepository(overrides: Partial<WebAuthRepository> = {}): WebAuthRepository {
  return {
    issueVerificationChallenge: () =>
      Promise.reject(new Error('Unconfigured issueVerificationChallenge fixture')),
    markVerificationDeliverySent: () => Promise.resolve(true),
    markVerificationDeliveryFailed: () => Promise.resolve(true),
    findAccountByEmail: () => Promise.reject(new Error('Unconfigured findAccountByEmail fixture')),
    findChallenge: () => Promise.reject(new Error('Unconfigured findChallenge fixture')),
    verify: () => Promise.reject(new Error('Unconfigured verify fixture')),
    findAccountById: () => Promise.reject(new Error('Unconfigured findAccountById fixture')),
    updateProfile: () => Promise.reject(new Error('Unconfigured updateProfile fixture')),
    createRefreshToken: () => Promise.reject(new Error('Unconfigured createRefreshToken fixture')),
    rotateRefreshToken: () => Promise.reject(new Error('Unconfigured rotateRefreshToken fixture')),
    revokeRefreshToken: () => Promise.reject(new Error('Unconfigured revokeRefreshToken fixture')),
    ...overrides,
  };
}

export function registrationService(
  repository: WebAuthRepository,
  sender: VerificationCodeSender = { send: () => Promise.resolve() },
  generator: VerificationCodeGenerator = { generate: () => '123456' },
): WebRegistrationService {
  return new WebRegistrationService(repository, generator, sender, testClock, testConfig);
}

export function sessionService(repository: WebAuthRepository, jwt = testJwt()): WebSessionService {
  return new WebSessionService(repository, testClock, testConfig, jwt);
}

export function testJwt(): JwtService {
  return new JwtService({ secret: testConfig.get('webAuth', { infer: true }).accessSecret });
}
