import { PrismaWebAuthRepository } from '../../src/modules/web-auth/infrastructure/prisma-web-auth.repository';
import type {
  WebAccount,
  OtpChallenge,
} from '../../src/modules/web-auth/domain/web-auth.repository';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

const now = new Date('2026-09-29T00:00:00.000Z');
const account: WebAccount = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'user@example.test',
  passwordHash: 'old-password-hash',
  pendingPasswordHash: 'pending-password-hash',
  registrationAttemptId: '00000000-0000-4000-8000-000000000002',
  emailVerifiedAt: null,
  disabledAt: null,
  createdAt: now,
};
const oldChallenge: OtpChallenge = {
  id: '00000000-0000-4000-8000-000000000003',
  accountId: account.id,
  registrationAttemptId: account.registrationAttemptId,
  otpHash: 'a'.repeat(64),
  expiresAt: new Date(now.getTime() + 300_000),
  resendAvailableAt: new Date(now.getTime() + 60_000),
  attemptCount: 0,
  consumedAt: null,
  createdAt: now,
  deliveryStatus: 'SENT',
  retryAnchorId: null,
};
const newChallenge = {
  id: '00000000-0000-4000-8000-000000000004',
  registrationAttemptId: '00000000-0000-4000-8000-000000000005',
  otpHash: 'b'.repeat(64),
  expiresAt: new Date(now.getTime() + 300_000),
  resendAvailableAt: new Date(now.getTime() + 60_000),
  createdAt: now,
  deliveryStatus: 'PENDING' as const,
  retryAnchorId: null,
};

function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: account.id }]),
    webAccount: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue(account),
      update: jest.fn().mockResolvedValue(account),
    },
    webOtpChallenge: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
    webAccount: { findUnique: jest.fn() },
  };
  return {
    tx,
    repository: new PrismaWebAuthRepository(prisma as unknown as PrismaService),
  };
}

describe('PrismaWebAuthRepository verification challenge issuance', () => {
  it('rejects registration retry during the stored cooldown without changing credentials or challenge', async () => {
    const { tx, repository } = setup();
    tx.webOtpChallenge.findFirst.mockResolvedValue({
      resendAvailableAt: oldChallenge.resendAvailableAt,
    });

    const result = await repository.issueVerificationChallenge({
      kind: 'register',
      email: account.email!,
      passwordHash: 'replacement-password-hash',
      attemptId: newChallenge.registrationAttemptId,
      challenge: newChallenge,
      now,
    });

    expect(result).toEqual({ error: 'OTP_RESEND_TOO_SOON' });
    expect(tx.webAccount.update).not.toHaveBeenCalled();
    expect(tx.webOtpChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.webOtpChallenge.create).not.toHaveBeenCalled();
  });

  it('supersedes the prior challenge and updates pending credentials after cooldown', async () => {
    const { tx, repository } = setup();
    tx.webOtpChallenge.findFirst.mockResolvedValue({
      resendAvailableAt: new Date(now.getTime() - 1),
    });
    const created = { ...newChallenge, accountId: account.id };
    tx.webOtpChallenge.create.mockResolvedValue(created);

    const result = await repository.issueVerificationChallenge({
      kind: 'register',
      email: account.email!,
      passwordHash: 'replacement-password-hash',
      attemptId: newChallenge.registrationAttemptId,
      challenge: newChallenge,
      now,
    });

    expect(result).toEqual({ email: account.email, challenge: created });
    expect(tx.webOtpChallenge.updateMany).toHaveBeenCalledWith({
      where: { accountId: account.id, consumedAt: null },
      data: { consumedAt: now },
    });
    expect(tx.webAccount.update).toHaveBeenCalledWith({
      where: { id: account.id },
      data: {
        pendingPasswordHash: 'replacement-password-hash',
        registrationAttemptId: newChallenge.registrationAttemptId,
      },
    });
  });

  it('resolves resend destination from the challenge account and returns the replacement challenge', async () => {
    const { tx, repository } = setup();
    const created = {
      ...newChallenge,
      accountId: account.id,
      registrationAttemptId: account.registrationAttemptId,
    };
    tx.webOtpChallenge.findUnique
      .mockResolvedValueOnce({ accountId: account.id })
      .mockResolvedValueOnce(oldChallenge);
    tx.webOtpChallenge.findFirst
      .mockResolvedValueOnce({
        id: oldChallenge.id,
        deliveryStatus: 'SENT',
        retryAnchorId: null,
        registrationAttemptId: account.registrationAttemptId,
      })
      .mockResolvedValueOnce({ resendAvailableAt: new Date(now.getTime() - 1) });
    tx.webOtpChallenge.create.mockResolvedValue(created);

    const result = await repository.issueVerificationChallenge({
      kind: 'resend',
      challengeId: oldChallenge.id,
      challenge: {
        ...newChallenge,
        registrationAttemptId: undefined,
        retryAnchorId: oldChallenge.id,
      },
      now,
    });

    expect(result).toEqual({ email: account.email, challenge: created });
    expect(tx.webAccount.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: account.id } });
    expect(tx.webOtpChallenge.updateMany).toHaveBeenCalledWith({
      where: { accountId: account.id, consumedAt: null },
      data: { consumedAt: now },
    });
  });

  it('rejects resend for a superseded or consumed challenge', async () => {
    const { tx, repository } = setup();
    tx.webOtpChallenge.findUnique
      .mockResolvedValueOnce({ accountId: account.id })
      .mockResolvedValueOnce({ ...oldChallenge, consumedAt: now });
    tx.webOtpChallenge.findFirst.mockResolvedValue({
      id: newChallenge.id,
      deliveryStatus: 'SENT',
      retryAnchorId: null,
      registrationAttemptId: account.registrationAttemptId,
    });

    const result = await repository.issueVerificationChallenge({
      kind: 'resend',
      challengeId: oldChallenge.id,
      challenge: { ...newChallenge, registrationAttemptId: undefined },
      now,
    });

    expect(result).toEqual({ error: 'OTP_CONSUMED' });
    expect(tx.webOtpChallenge.create).not.toHaveBeenCalled();
  });

  it('retries a failed resend from its consumed source challenge after the short deadline', async () => {
    const { tx, repository } = setup();
    const failedChallengeId = newChallenge.id;
    const replacement = {
      ...newChallenge,
      id: '00000000-0000-4000-8000-000000000006',
      accountId: account.id,
      registrationAttemptId: account.registrationAttemptId,
      retryAnchorId: oldChallenge.id,
    };
    tx.webOtpChallenge.findUnique
      .mockResolvedValueOnce({ accountId: account.id })
      .mockResolvedValueOnce({ ...oldChallenge, consumedAt: now });
    tx.webOtpChallenge.findFirst
      .mockResolvedValueOnce({
        id: failedChallengeId,
        deliveryStatus: 'FAILED',
        retryAnchorId: oldChallenge.id,
        registrationAttemptId: account.registrationAttemptId,
      })
      .mockResolvedValueOnce({ resendAvailableAt: new Date(now.getTime() - 1) });
    tx.webOtpChallenge.create.mockResolvedValue(replacement);

    const result = await repository.issueVerificationChallenge({
      kind: 'resend',
      challengeId: oldChallenge.id,
      challenge: {
        ...newChallenge,
        id: replacement.id,
        retryAnchorId: oldChallenge.id,
      },
      now,
    });

    expect(result).toEqual({ email: account.email, challenge: replacement });
    expect(tx.webOtpChallenge.updateMany).toHaveBeenCalledWith({
      where: { accountId: account.id, consumedAt: null },
      data: { consumedAt: now },
    });
  });

  it('does not resend to a legacy account without an email destination', async () => {
    const { tx, repository } = setup();
    tx.webOtpChallenge.findUnique.mockResolvedValueOnce({ accountId: account.id });
    tx.webAccount.findUniqueOrThrow.mockResolvedValue({ ...account, email: null });

    const result = await repository.issueVerificationChallenge({
      kind: 'resend',
      challengeId: oldChallenge.id,
      challenge: { ...newChallenge, registrationAttemptId: undefined },
      now,
    });

    expect(result).toEqual({ error: 'OTP_CHALLENGE_NOT_FOUND' });
    expect(tx.webOtpChallenge.create).not.toHaveBeenCalled();
  });

  it('does not let a legacy phone challenge verify an email account', async () => {
    const { tx, repository } = setup();
    tx.webOtpChallenge.findUnique.mockResolvedValueOnce({ accountId: account.id });
    tx.webOtpChallenge.findUniqueOrThrow.mockResolvedValue({
      ...oldChallenge,
      account: { ...account, email: null },
    });

    const result = await repository.verify(oldChallenge.id, 'a'.repeat(64), now, 5);

    expect(result).toEqual({ error: 'OTP_CONSUMED' });
  });
});
