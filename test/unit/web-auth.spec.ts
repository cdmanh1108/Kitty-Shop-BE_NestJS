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
    issueVerificationChallenge: jest.fn(),
    findAccount: jest.fn(),
    findChallenge: jest.fn(),
    verify: jest.fn(),
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
    const issueVerificationChallenge: WebAuthRepository['issueVerificationChallenge'] = jest
      .fn()
      .mockResolvedValue({ challenge, phone: '+84912345678' });
    const repo = repository({
      findAccount: jest.fn().mockResolvedValue(null),
      issueVerificationChallenge,
    });
    await service(repo).register({ phone: '84 912 345 678', password: 'password dài' });
    expect(issueVerificationChallenge).toHaveBeenCalledTimes(1);
    const issueMock = jest.mocked(issueVerificationChallenge);
    const issueRequest = issueMock.mock.calls[0]?.[0];
    expect(issueRequest).toMatchObject({ kind: 'register', phone: '+84912345678' });
    if (issueRequest?.kind !== 'register')
      throw new Error('Expected a registration challenge request');
    expect(issueRequest.passwordHash).toMatch(/^\$2/);
    expect(issueRequest.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(issueRequest.challenge.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(issueRequest.passwordHash).not.toBe('password dài');
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
    const challenge: OtpChallenge = {
      id: '00000000-0000-4000-8000-000000000002',
      accountId: pending.id,
      otpHash: 'a'.repeat(64),
      registrationAttemptId: '00000000-0000-4000-8000-000000000003',
      expiresAt: new Date(now.getTime() + 300000),
      resendAvailableAt: new Date(now.getTime() + 60000),
      attemptCount: 0,
      consumedAt: null,
      createdAt: now,
    };
    const issue = jest.fn().mockResolvedValue({ challenge, phone: pending.phone });
    const repo = repository();
    repo.findAccount = jest.fn().mockResolvedValue(pending);
    repo.issueVerificationChallenge = issue;
    const result = await service(repo).register({
      phone: '0912345678',
      password: 'right-password',
    });
    expect(result.challengeId).toEqual(expect.any(String));
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'register', phone: pending.phone }),
    );
  });

  it('does not send a verification code when registration is rejected by cooldown', async () => {
    const pending = { ...account('unused-hash'), phoneVerifiedAt: null };
    const send = jest.fn();
    const issue = jest.fn().mockResolvedValue({ error: 'OTP_RESEND_TOO_SOON' });
    const repo = repository({
      findAccount: jest.fn().mockResolvedValue(pending),
      issueVerificationChallenge: issue,
    });

    await expect(
      service(repo, { generateCode: () => '123456', send }).register({
        phone: pending.phone,
        password: 'right-password',
      }),
    ).rejects.toMatchObject({ status: 429, response: { code: 'OTP_RESEND_TOO_SOON' } });
    expect(issue).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('resends by challenge id and delivers to the server-resolved account phone', async () => {
    const challenge: OtpChallenge = {
      id: '00000000-0000-4000-8000-000000000004',
      accountId: 'account',
      registrationAttemptId: '00000000-0000-4000-8000-000000000003',
      otpHash: 'b'.repeat(64),
      expiresAt: new Date(now.getTime() + 300000),
      resendAvailableAt: new Date(now.getTime() + 60000),
      attemptCount: 0,
      consumedAt: null,
      createdAt: now,
    };
    const send = jest.fn();
    const issue = jest.fn().mockResolvedValue({ challenge, phone: '+84912345678' });
    const repo = repository({
      issueVerificationChallenge: issue,
    });
    const previousChallengeId = '00000000-0000-4000-8000-000000000003';

    const result = await service(repo, { generateCode: () => '654321', send }).resend(
      previousChallengeId,
    );

    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'resend', challengeId: previousChallengeId }),
    );
    expect(result.challengeId).toBe(challenge.id);
    expect(send).toHaveBeenCalledWith('+84912345678', '654321', challenge.id);
  });

  it('does not deliver when a challenge resend is rejected by cooldown', async () => {
    const send = jest.fn();
    const issue = jest.fn().mockResolvedValue({ error: 'OTP_RESEND_TOO_SOON' });
    const repo = repository({
      issueVerificationChallenge: issue,
    });

    await expect(
      service(repo, { generateCode: () => '123456', send }).resend('challenge-id'),
    ).rejects.toMatchObject({ status: 429, response: { code: 'OTP_RESEND_TOO_SOON' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps verified duplicate registrations directed to login', async () => {
    await expect(
      service(
        repository({ findAccount: jest.fn().mockResolvedValue(account('unused-hash')) }),
      ).register({ phone: '0912345678', password: 'right-password' }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'PHONE_ALREADY_REGISTERED' } });
  });
});
