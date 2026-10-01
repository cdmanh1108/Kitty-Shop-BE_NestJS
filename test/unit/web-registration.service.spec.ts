import { createHmac } from 'node:crypto';
import type {
  OtpChallenge,
  WebAuthRepository,
} from '../../src/modules/web-auth/domain/web-auth.repository';
import type { VerificationCodeSender } from '../../src/modules/web-auth/domain/verification-code';
import { WebAuthApplicationError } from '../../src/modules/web-auth/domain/web-auth.errors';
import { now, registrationService, testAccount, webAuthRepository } from './web-auth-test-fixtures';

const activeChallenge = (id: string, accountId = 'account'): OtpChallenge => ({
  id,
  accountId,
  otpHash: 'a'.repeat(64),
  expiresAt: new Date(now.getTime() + 300_000),
  resendAvailableAt: new Date(now.getTime() + 60_000),
  attemptCount: 0,
  consumedAt: null,
  createdAt: now,
  deliveryStatus: 'SENT',
  retryAnchorId: null,
});

describe('WebRegistrationService', () => {
  it('normalizes email, hashes the password, and sends a code only after persistence accepts the challenge', async () => {
    const challenge = activeChallenge('00000000-0000-4000-8000-000000000001');
    const issueVerificationChallenge: WebAuthRepository['issueVerificationChallenge'] = jest
      .fn()
      .mockResolvedValue({ challenge, email: 'user@example.test' });
    const send = jest.fn<
      ReturnType<VerificationCodeSender['send']>,
      Parameters<VerificationCodeSender['send']>
    >();
    const repo = webAuthRepository({
      findAccountByEmail: jest.fn().mockResolvedValue(null),
      issueVerificationChallenge,
    });

    await registrationService(repo, { send }).register({
      email: ' User@Example.Test ',
      password: 'password1',
    });

    const issueRequest = jest.mocked(issueVerificationChallenge).mock.calls[0]?.[0];
    expect(issueRequest).toMatchObject({ kind: 'register', email: 'user@example.test' });
    if (issueRequest?.kind !== 'register') throw new Error('Expected a registration challenge');
    expect(issueRequest.passwordHash).toMatch(/^\$2/);
    expect(issueRequest.passwordHash).not.toBe('password1');
    expect(issueRequest.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(issueRequest.challenge.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(send).toHaveBeenCalledWith('user@example.test', '123456', challenge.id);
  });

  it('fails registration safely and stores a short retry deadline when delivery fails', async () => {
    const challenge = activeChallenge('00000000-0000-4000-8000-000000000006');
    const send = jest.fn().mockRejectedValue(new Error('Domain not verified: resend_api_key'));
    const markVerificationDeliverySent = jest.fn().mockResolvedValue(true);
    const markVerificationDeliveryFailed = jest.fn().mockResolvedValue(true);
    const repo = webAuthRepository({
      findAccountByEmail: jest.fn().mockResolvedValue(null),
      issueVerificationChallenge: jest.fn().mockResolvedValue({
        challenge: { ...challenge, deliveryStatus: 'PENDING' },
        email: 'user@example.test',
      }),
      markVerificationDeliverySent,
      markVerificationDeliveryFailed,
    });

    await expect(
      registrationService(repo, { send }).register({
        email: 'user@example.test',
        password: 'password1',
      }),
    ).rejects.toBeInstanceOf(WebAuthApplicationError);
    await expect(
      registrationService(repo, { send }, { generate: () => '123456' }).register({
        email: 'user@example.test',
        password: 'password1',
      }),
    ).rejects.toMatchObject({
      code: 'VERIFICATION_DELIVERY_FAILED',
      message: 'Không thể gửi mã xác thực lúc này. Vui lòng thử lại sau.',
    });
    expect(markVerificationDeliverySent).not.toHaveBeenCalled();
    expect(markVerificationDeliveryFailed).toHaveBeenCalledWith(
      challenge.id,
      new Date(now.getTime() + 10_000),
    );
  });

  it('rejects invalid email before repository lookup', async () => {
    const findAccountByEmail = jest.fn();
    await expect(
      registrationService(webAuthRepository({ findAccountByEmail })).register({
        email: 'not an email',
        password: 'password1',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    expect(findAccountByEmail).not.toHaveBeenCalled();
  });

  it('directs verified or disabled duplicate accounts to login', async () => {
    for (const existing of [
      testAccount('unused-hash'),
      testAccount('unused-hash', { disabledAt: now }),
    ]) {
      await expect(
        registrationService(
          webAuthRepository({ findAccountByEmail: jest.fn().mockResolvedValue(existing) }),
        ).register({ email: 'user@example.test', password: 'right-password' }),
      ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    }
  });

  it('restarts a pending registration through the shared challenge issuance operation', async () => {
    const challenge = activeChallenge('00000000-0000-4000-8000-000000000002');
    const issue = jest.fn().mockResolvedValue({ challenge, email: 'user@example.test' });
    const repo = webAuthRepository({
      findAccountByEmail: jest
        .fn()
        .mockResolvedValue(testAccount('unused-hash', { emailVerifiedAt: null })),
      issueVerificationChallenge: issue,
    });

    await expect(
      registrationService(repo).register({
        email: 'user@example.test',
        password: 'right-password',
      }),
    ).resolves.toMatchObject({ challengeId: challenge.id });
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'register', email: 'user@example.test' }),
    );
  });

  it('preserves the persistent registration cooldown and does not send on rejection', async () => {
    const send = jest.fn();
    const issue = jest.fn().mockResolvedValue({ error: 'OTP_RESEND_TOO_SOON' });
    const repo = webAuthRepository({
      findAccountByEmail: jest
        .fn()
        .mockResolvedValue(testAccount('unused-hash', { emailVerifiedAt: null })),
      issueVerificationChallenge: issue,
    });

    await expect(
      registrationService(repo, { send }).register({
        email: 'user@example.test',
        password: 'right-password',
      }),
    ).rejects.toMatchObject({ code: 'OTP_RESEND_TOO_SOON' });
    expect(issue).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('resends by challenge ID and sends to the repository-resolved account email', async () => {
    const challenge = activeChallenge('00000000-0000-4000-8000-000000000004');
    const send = jest.fn();
    const issue = jest.fn().mockResolvedValue({ challenge, email: 'user@example.test' });
    const previousChallengeId = '00000000-0000-4000-8000-000000000003';

    const result = await registrationService(
      webAuthRepository({ issueVerificationChallenge: issue }),
      { send },
      { generate: () => '654321' },
    ).resend(previousChallengeId);

    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'resend', challengeId: previousChallengeId }),
    );
    expect(result.challengeId).toBe(challenge.id);
    expect(send).toHaveBeenCalledWith('user@example.test', '654321', challenge.id);
  });

  it('preserves resend cooldown and verified-account rejection without delivery', async () => {
    const send = jest.fn();
    for (const [error] of [
      ['OTP_RESEND_TOO_SOON', 429],
      ['EMAIL_ALREADY_VERIFIED', 400],
    ] as const) {
      await expect(
        registrationService(
          webAuthRepository({ issueVerificationChallenge: jest.fn().mockResolvedValue({ error }) }),
          { send },
        ).resend('challenge-id'),
      ).rejects.toMatchObject({ code: error });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('verifies an HMAC-bound code with the configured attempt limit', async () => {
    const verify = jest.fn().mockResolvedValue({ verified: true });
    const challengeId = '00000000-0000-4000-8000-000000000005';
    await expect(
      registrationService(webAuthRepository({ verify })).verify(challengeId, '123456'),
    ).resolves.toEqual({ verified: true });

    const expectedHash = createHmac('sha256', 'otp-test-secret-at-least-thirty-two-characters')
      .update(`kitty-web-registration:${challengeId}:123456`)
      .digest('hex');
    expect(verify).toHaveBeenCalledWith(challengeId, expectedHash, now, 5);
  });

  it.each(['OTP_INVALID', 'OTP_EXPIRED', 'OTP_ATTEMPTS_EXCEEDED'] as const)(
    'preserves verify error %s',
    async (error) => {
      await expect(
        registrationService(
          webAuthRepository({ verify: jest.fn().mockResolvedValue({ error }) }),
        ).verify('challenge-id', '000000'),
      ).rejects.toMatchObject({ code: error });
    },
  );
});
