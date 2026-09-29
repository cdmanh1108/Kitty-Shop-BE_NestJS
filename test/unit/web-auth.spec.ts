import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { WebAuthService } from '../../src/modules/web-auth/application/web-auth.service';
import type {
  WebAuthRepository,
  WebAccount,
  OtpChallenge,
} from '../../src/modules/web-auth/domain/web-auth.repository';
import type {
  VerificationCodeGenerator,
  VerificationCodeSender,
} from '../../src/modules/web-auth/domain/verification-code';
import type { Clock } from '../../src/common/clock/clock';
import type { AppConfiguration } from '../../src/config/configuration';

const now = new Date('2026-09-16T00:00:00Z');
const account = (passwordHash: string, options: Partial<WebAccount> = {}): WebAccount => ({
  id: 'account',
  email: 'user@example.test',
  passwordHash,
  emailVerifiedAt: now,
  disabledAt: null,
  createdAt: now,
  ...options,
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
    findAccountByEmail: jest.fn(),
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
  sender: VerificationCodeSender = { send: jest.fn() },
  generator: VerificationCodeGenerator = { generate: () => '123456' },
): WebAuthService {
  return new WebAuthService(
    repo,
    generator,
    sender,
    { now: () => now } satisfies Clock,
    config,
    new JwtService({ secret: config.get('webAuth', { infer: true }).accessSecret }),
  );
}

describe('WebAuthService', () => {
  it('normalizes registration email and never sends the password to persistence', async () => {
    const challenge: OtpChallenge = {
      id: '00000000-0000-4000-8000-000000000001',
      accountId: 'account',
      otpHash: 'a'.repeat(64),
      expiresAt: new Date(now.getTime() + 300000),
      resendAvailableAt: new Date(now.getTime() + 60000),
      attemptCount: 0,
      consumedAt: null,
      createdAt: now,
    };
    const issueVerificationChallenge: WebAuthRepository['issueVerificationChallenge'] = jest
      .fn()
      .mockResolvedValue({ challenge, email: 'user@example.test' });
    const repo = repository({
      findAccountByEmail: jest.fn().mockResolvedValue(null),
      issueVerificationChallenge,
    });
    const send = jest.fn();
    const sender: VerificationCodeSender = { send };

    await service(repo, sender).register({ email: ' User@Example.Test ', password: 'password1' });

    const issueRequest = jest.mocked(issueVerificationChallenge).mock.calls[0]?.[0];
    expect(issueRequest).toMatchObject({ kind: 'register', email: 'user@example.test' });
    if (issueRequest?.kind !== 'register') throw new Error('Expected a registration challenge');
    expect(issueRequest.passwordHash).toMatch(/^\$2/);
    expect(issueRequest.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(issueRequest.challenge.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(issueRequest.passwordHash).not.toBe('password1');
    expect(send).toHaveBeenCalledWith('user@example.test', '123456', challenge.id);
  });

  it('rejects invalid email before repository lookup', async () => {
    const findAccountByEmail = jest.fn();
    await expect(
      service(repository({ findAccountByEmail })).register({
        email: 'not an email',
        password: 'password1',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_EMAIL' } });
    expect(findAccountByEmail).not.toHaveBeenCalled();
  });

  it('returns one generic credential error for an unknown email and wrong password', async () => {
    const passwordHash = await hash('right-password', 4);
    for (const result of [null, account(passwordHash)]) {
      const promise = service(
        repository({ findAccountByEmail: jest.fn().mockResolvedValue(result) }),
      ).login({ email: 'user@example.test', password: 'wrong-password' }, {});
      await expect(promise).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    }
  });

  it('normalizes login email and blocks unverified accounts after password proof', async () => {
    const pending = account(await hash('right-password', 4), { emailVerifiedAt: null });
    const findAccountByEmail = jest.fn().mockResolvedValue(pending);
    await expect(
      service(repository({ findAccountByEmail })).login(
        { email: ' User@Example.Test ', password: 'right-password' },
        {},
      ),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_NOT_VERIFIED' } });
    expect(findAccountByEmail).toHaveBeenCalledWith('user@example.test');
  });

  it('rejects disabled accounts after validating the submitted password', async () => {
    const disabled = account(await hash('right-password', 4), { disabledAt: now });
    await expect(
      service(repository({ findAccountByEmail: jest.fn().mockResolvedValue(disabled) })).login(
        { email: 'user@example.test', password: 'right-password' },
        {},
      ),
    ).rejects.toMatchObject({ status: 403, response: { code: 'ACCOUNT_DISABLED' } });
  });

  it('starts a new credential-bound attempt when registration is still pending', async () => {
    const pending = account('unused-hash', { emailVerifiedAt: null });
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
    const issue = jest.fn().mockResolvedValue({ challenge, email: pending.email });
    const repo = repository({
      findAccountByEmail: jest.fn().mockResolvedValue(pending),
      issueVerificationChallenge: issue,
    });

    const result = await service(repo).register({
      email: 'user@example.test',
      password: 'right-password',
    });

    expect(result.challengeId).toEqual(expect.any(String));
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'register', email: 'user@example.test' }),
    );
  });

  it('does not send a verification code when registration is rejected by cooldown', async () => {
    const send = jest.fn();
    const issue = jest.fn().mockResolvedValue({ error: 'OTP_RESEND_TOO_SOON' });
    const repo = repository({
      findAccountByEmail: jest
        .fn()
        .mockResolvedValue(account('unused-hash', { emailVerifiedAt: null })),
      issueVerificationChallenge: issue,
    });

    await expect(
      service(repo, { send }).register({ email: 'user@example.test', password: 'right-password' }),
    ).rejects.toMatchObject({ status: 429, response: { code: 'OTP_RESEND_TOO_SOON' } });
    expect(issue).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('resends by challenge ID and delivers to the server-resolved account email', async () => {
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
    const issue = jest.fn().mockResolvedValue({ challenge, email: 'user@example.test' });
    const previousChallengeId = '00000000-0000-4000-8000-000000000003';

    const result = await service(
      repository({ issueVerificationChallenge: issue }),
      {
        send,
      },
      { generate: () => '654321' },
    ).resend(previousChallengeId);

    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'resend', challengeId: previousChallengeId }),
    );
    expect(result.challengeId).toBe(challenge.id);
    expect(send).toHaveBeenCalledWith('user@example.test', '654321', challenge.id);
  });

  it('does not deliver when challenge resend is rejected by cooldown', async () => {
    const send = jest.fn();
    const issue = jest.fn().mockResolvedValue({ error: 'OTP_RESEND_TOO_SOON' });

    await expect(
      service(repository({ issueVerificationChallenge: issue }), { send }).resend('challenge-id'),
    ).rejects.toMatchObject({ status: 429, response: { code: 'OTP_RESEND_TOO_SOON' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps verified duplicate registrations directed to login', async () => {
    await expect(
      service(
        repository({ findAccountByEmail: jest.fn().mockResolvedValue(account('unused-hash')) }),
      ).register({
        email: 'user@example.test',
        password: 'right-password',
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_ALREADY_REGISTERED' } });
  });

  it('keeps a valid pre-migration access token profile available for a legacy account', async () => {
    const legacy = account('legacy-password', { email: null, emailVerifiedAt: null });
    await expect(
      service(
        repository({ findAccountById: jest.fn().mockResolvedValue(legacy) }),
      ).accountForAccessToken(legacy.id),
    ).resolves.toMatchObject({ id: legacy.id, email: null, emailVerifiedAt: null });
  });

  it('continues an existing refresh session for a retained legacy account', async () => {
    const legacy = account('legacy-password', { email: null, emailVerifiedAt: null });
    const rotateRefreshToken = jest.fn().mockResolvedValue({ outcome: 'ROTATED', account: legacy });

    await expect(
      service(repository({ rotateRefreshToken })).refresh('a'.repeat(64), {}),
    ).resolves.toMatchObject({ user: { id: legacy.id, email: null, emailVerifiedAt: null } });
    expect(rotateRefreshToken).toHaveBeenCalledTimes(1);
  });
});
