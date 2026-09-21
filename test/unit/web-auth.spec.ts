import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebAuthService } from '../../src/modules/web-auth/application/web-auth.service';
import type {
  WebAuthRepository,
  WebAccount,
  OtpChallenge,
} from '../../src/modules/web-auth/domain/web-auth.repository';
import type { OtpProvider } from '../../src/modules/web-auth/domain/otp-provider';
import type { Clock } from '../../src/common/clock/clock';
import type { AppConfiguration } from '../../src/config/configuration';
import { hash } from 'bcryptjs';

const now = new Date('2026-09-16T00:00:00Z');
const account = (passwordHash: string): WebAccount => ({
  id: 'account',
  phone: '+84912345678',
  passwordHash,
  phoneVerifiedAt: now,
  disabledAt: null,
  createdAt: now,
});
const config = new ConfigService<AppConfiguration, true>({
  jwtAccessSecret: 'test-secret-at-least-thirty-two-characters',
  webAuth: {
    bypassEnabled: true,
    bypassCode: '123456',
    otpTtlSeconds: 300,
    otpMaxAttempts: 5,
    resendCooldownSeconds: 60,
    accessSecret: 'web-test-secret-at-least-thirty-two-characters',
    accessTtlSeconds: 900,
    refreshTokenTtlDays: 7,
    otpHashSecret: 'otp-test-secret-at-least-thirty-two-characters',
  },
});
function repository(overrides: Partial<WebAuthRepository> = {}): WebAuthRepository {
  return {
    register: jest.fn(),
    findAccount: jest.fn(),
    findChallenge: jest.fn(),
    verify: jest.fn(),
    resend: jest.fn(),
    findAccountById: jest.fn(),
    createRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    ...overrides,
  } as WebAuthRepository;
}
function service(
  repo: WebAuthRepository,
  provider: OtpProvider = { generateCode: () => '123456', send: jest.fn() },
): WebAuthService {
  return new WebAuthService(
    repo,
    provider,
    { now: () => now } satisfies Clock,
    config,
    new JwtService({ secret: config.get('webAuth', { infer: true }).accessSecret }),
  );
}
describe('WebAuthService', () => {
  it('normalizes registration phones and never sends the password to persistence', async () => {
    const challenge = {
      id: '00000000-0000-4000-8000-000000000001',
      accountId: 'account',
      otpHash: 'a'.repeat(64),
      expiresAt: new Date(now.getTime() + 300000),
      resendAvailableAt: new Date(now.getTime() + 60000),
      attemptCount: 0,
      consumedAt: null,
      createdAt: now,
    } satisfies OtpChallenge;
    let persistedHash = '';
    let persistedPhone = '';
    let persistedChallengeId = '';
    const register: WebAuthRepository['register'] = jest.fn(
      (_phone: string, passwordHash: string, _attemptId: string, newChallenge) => {
        persistedPhone = _phone;
        persistedHash = passwordHash;
        persistedChallengeId = newChallenge.id;
        return Promise.resolve(challenge);
      },
    );
    const repo = repository({ findAccount: jest.fn().mockResolvedValue(null), register });
    await service(repo).register({ phone: '84 912 345 678', password: 'password dài' });
    expect(register).toHaveBeenCalledTimes(1);
    expect(persistedPhone).toBe('+84912345678');
    expect(persistedHash).toMatch(/^\$2/);
    expect(persistedChallengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(persistedHash).not.toBe('password dài');
  });
  it('returns one generic credential error for unknown phone and wrong password', async () => {
    const passwordHash = await hash('right-password', 4);
    for (const result of [null, account(passwordHash)]) {
      const promise = service(
        repository({ findAccount: jest.fn().mockResolvedValue(result) }),
      ).login({ phone: '0912345678', password: 'wrong-password' }, {});
      await expect(promise).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    }
  });
  it('blocks unverified accounts after correct password proof', async () => {
    const pending = { ...account(await hash('right-password', 4)), phoneVerifiedAt: null };
    await expect(
      service(repository({ findAccount: jest.fn().mockResolvedValue(pending) })).login(
        { phone: '0912345678', password: 'right-password' },
        {},
      ),
    ).rejects.toMatchObject({ response: { code: 'PHONE_NOT_VERIFIED' } });
  });
  it('starts a new credential-bound attempt when registration is still pending', async () => {
    const pending = { ...account('unused-hash'), phoneVerifiedAt: null };
    const register: WebAuthRepository['register'] = jest.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      accountId: pending.id,
      otpHash: 'a'.repeat(64),
      registrationAttemptId: '00000000-0000-4000-8000-000000000003',
      expiresAt: new Date(now.getTime() + 300000),
      resendAvailableAt: new Date(now.getTime() + 60000),
      attemptCount: 0,
      consumedAt: null,
      createdAt: now,
    } satisfies OtpChallenge);
    const repo = repository();
    repo.findAccount = jest.fn().mockResolvedValue(pending);
    repo.register = register;
    const result = await service(repo).register({
      phone: '0912345678',
      password: 'right-password',
    });
    expect(result.challengeId).toEqual(expect.any(String));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('keeps verified duplicate registrations directed to login', async () => {
    await expect(
      service(
        repository({ findAccount: jest.fn().mockResolvedValue(account('unused-hash')) }),
      ).register({ phone: '0912345678', password: 'right-password' }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'PHONE_ALREADY_REGISTERED' } });
  });
});
