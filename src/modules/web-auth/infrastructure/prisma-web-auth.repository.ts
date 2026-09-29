import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import {
  type WebAuthRepository,
  type NewChallenge,
  type VerifyResult,
  type ChallengeIssueRequest,
  type ChallengeIssueResult,
  type ChallengeIssuePersistenceResult,
  type WebRefreshTokenData,
} from '../domain/web-auth.repository';

@Injectable()
export class PrismaWebAuthRepository implements WebAuthRepository {
  constructor(private readonly prisma: PrismaService) {}
  async issueVerificationChallenge(request: ChallengeIssueRequest): Promise<ChallengeIssueResult> {
    try {
      return await this.prisma.$transaction(async (tx): Promise<ChallengeIssueResult> => {
        if (request.kind === 'register') return this.issueFromRegistration(tx, request);
        return this.issueFromChallenge(tx, request);
      });
    } catch (error) {
      if (
        request.kind === 'register' &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const racedAccount = await this.prisma.webAccount.findUnique({
          where: { phone: request.phone },
        });
        if (racedAccount) {
          return racedAccount.phoneVerifiedAt || racedAccount.disabledAt
            ? { error: 'PHONE_ALREADY_REGISTERED' }
            : { error: 'OTP_RESEND_TOO_SOON' };
        }
      }
      throw error;
    }
  }
  private async issueFromRegistration(
    tx: Prisma.TransactionClient,
    request: Extract<ChallengeIssueRequest, { kind: 'register' }>,
  ): Promise<ChallengeIssueResult> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM web_accounts WHERE phone = ${request.phone} FOR UPDATE
    `;
    const existingId = rows[0]?.id;
    if (!existingId) {
      const account = await tx.webAccount.create({
        data: {
          phone: request.phone,
          passwordHash: request.passwordHash,
          pendingPasswordHash: request.passwordHash,
          registrationAttemptId: request.attemptId,
        },
      });
      const issued = await this.issueNextChallenge(
        tx,
        account.id,
        request.attemptId,
        request.challenge,
        request.now,
      );
      return 'error' in issued ? issued : { phone: account.phone, challenge: issued.challenge };
    }

    const account = await tx.webAccount.findUniqueOrThrow({ where: { id: existingId } });
    if (account.phoneVerifiedAt || account.disabledAt) return { error: 'PHONE_ALREADY_REGISTERED' };
    const issued = await this.issueNextChallenge(
      tx,
      account.id,
      request.attemptId,
      request.challenge,
      request.now,
    );
    if ('error' in issued) return issued;
    await tx.webAccount.update({
      where: { id: account.id },
      data: { pendingPasswordHash: request.passwordHash, registrationAttemptId: request.attemptId },
    });
    return { phone: account.phone, challenge: issued.challenge };
  }
  private async issueFromChallenge(
    tx: Prisma.TransactionClient,
    request: Extract<ChallengeIssueRequest, { kind: 'resend' }>,
  ): Promise<ChallengeIssueResult> {
    const initial = await tx.webOtpChallenge.findUnique({
      where: { id: request.challengeId },
      select: { accountId: true },
    });
    if (!initial) return { error: 'OTP_CHALLENGE_NOT_FOUND' };
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM web_accounts WHERE id = ${initial.accountId}::uuid FOR UPDATE
    `;
    if (!locked[0]) return { error: 'OTP_CHALLENGE_NOT_FOUND' };

    const account = await tx.webAccount.findUniqueOrThrow({ where: { id: initial.accountId } });
    if (account.disabledAt) return { error: 'ACCOUNT_DISABLED' };
    if (account.phoneVerifiedAt) return { error: 'PHONE_ALREADY_VERIFIED' };
    if (!account.registrationAttemptId || !account.pendingPasswordHash)
      return { error: 'OTP_CHALLENGE_NOT_FOUND' };

    const requested = await tx.webOtpChallenge.findUnique({ where: { id: request.challengeId } });
    if (!requested) return { error: 'OTP_CHALLENGE_NOT_FOUND' };
    if (requested.consumedAt || requested.registrationAttemptId !== account.registrationAttemptId)
      return { error: 'OTP_CONSUMED' };
    const active = await tx.webOtpChallenge.findFirst({
      where: { accountId: account.id, consumedAt: null },
      select: { id: true },
    });
    if (!active) return { error: 'OTP_CHALLENGE_NOT_FOUND' };
    if (active.id !== request.challengeId) return { error: 'OTP_CONSUMED' };

    const issued = await this.issueNextChallenge(
      tx,
      account.id,
      account.registrationAttemptId,
      request.challenge,
      request.now,
    );
    return 'error' in issued ? issued : { phone: account.phone, challenge: issued.challenge };
  }
  private async issueNextChallenge(
    tx: Prisma.TransactionClient,
    accountId: string,
    attemptId: string,
    challenge: NewChallenge,
    now: Date,
  ): Promise<ChallengeIssuePersistenceResult> {
    // This stored deadline is the shared cooldown source for register retries and resends.
    const active = await tx.webOtpChallenge.findFirst({
      where: { accountId, consumedAt: null },
      select: { resendAvailableAt: true },
    });
    if (active && active.resendAvailableAt > now) return { error: 'OTP_RESEND_TOO_SOON' };
    await tx.webOtpChallenge.updateMany({
      where: { accountId, consumedAt: null },
      data: { consumedAt: now },
    });
    return {
      challenge: await tx.webOtpChallenge.create({
        data: { ...challenge, accountId, registrationAttemptId: attemptId },
      }),
    };
  }
  findAccount(phone: string) {
    return this.prisma.webAccount.findUnique({ where: { phone } });
  }
  findAccountById(id: string) {
    return this.prisma.webAccount.findUnique({ where: { id } });
  }
  findChallenge(id: string) {
    return this.prisma.webOtpChallenge.findUnique({ where: { id } });
  }
  async verify(id: string, otpHash: string, now: Date, maxAttempts: number): Promise<VerifyResult> {
    return this.prisma.$transaction(async (tx): Promise<VerifyResult> => {
      const initial = await tx.webOtpChallenge.findUnique({
        where: { id },
        select: { accountId: true },
      });
      if (!initial) return { error: 'OTP_CHALLENGE_NOT_FOUND' };
      // Verification, challenge issuance, and refresh issuance serialize on the account row.
      await tx.$queryRaw`SELECT id FROM web_accounts WHERE id = ${initial.accountId}::uuid FOR UPDATE`;
      const challenge = await tx.webOtpChallenge.findUniqueOrThrow({
        where: { id },
        include: { account: true },
      });
      if (challenge.account.disabledAt) return { error: 'ACCOUNT_DISABLED' };
      if (
        !challenge.registrationAttemptId ||
        challenge.registrationAttemptId !== challenge.account.registrationAttemptId ||
        !challenge.account.pendingPasswordHash
      )
        return { error: 'OTP_CONSUMED' };
      if (challenge.consumedAt) return { error: 'OTP_CONSUMED' };
      if (challenge.expiresAt <= now) return { error: 'OTP_EXPIRED' };
      if (challenge.attemptCount >= maxAttempts) return { error: 'OTP_ATTEMPTS_EXCEEDED' };
      await tx.webOtpChallenge.update({ where: { id }, data: { attemptCount: { increment: 1 } } });
      if (!timingSafeEqual(Buffer.from(challenge.otpHash, 'hex'), Buffer.from(otpHash, 'hex')))
        return { error: 'OTP_INVALID' };
      await tx.webOtpChallenge.update({ where: { id }, data: { consumedAt: now } });
      await tx.webAccount.update({
        where: { id: challenge.accountId },
        data: {
          passwordHash: challenge.account.pendingPasswordHash,
          pendingPasswordHash: null,
          registrationAttemptId: null,
          phoneVerifiedAt: now,
        },
      });
      await tx.webOtpChallenge.updateMany({
        where: { accountId: challenge.accountId, consumedAt: null },
        data: { consumedAt: now },
      });
      return { verified: true };
    });
  }
  async createRefreshToken(
    input: WebRefreshTokenData & { accountId: string; familyId: string },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM web_accounts WHERE id = ${input.accountId}::uuid FOR UPDATE`;
      const account = await tx.webAccount.findUnique({ where: { id: input.accountId } });
      if (!account?.phoneVerifiedAt || account.disabledAt) return false;
      await tx.webRefreshTokenFamily.create({
        data: { id: input.familyId, accountId: input.accountId },
      });
      await tx.webRefreshToken.create({ data: input });
      return true;
    });
  }
  async rotateRefreshToken(tokenHash: string, replacement: WebRefreshTokenData, now: Date) {
    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM web_refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE
        `;
          const tokenId = locked[0]?.id;
          if (!tokenId) return { outcome: 'REJECTED' } as const;
          const token = await tx.webRefreshToken.findUnique({
            where: { id: tokenId },
            include: { account: true, family: true },
          });
          if (!token || token.expiresAt <= now) return { outcome: 'REJECTED' } as const;
          if (token.revokedAt) {
            if (token.revocationReason !== 'ROTATED' || !token.consumedAt || token.family.revokedAt)
              return { outcome: 'REJECTED' } as const;
            const compromised = await tx.webRefreshTokenFamily.updateMany({
              where: { id: token.familyId, revokedAt: null },
              data: { revokedAt: now, revocationReason: 'REUSE_DETECTED', reuseDetectedAt: now },
            });
            if (compromised.count === 1) {
              await tx.webRefreshToken.updateMany({
                where: { familyId: token.familyId, revokedAt: null },
                data: { revokedAt: now, revocationReason: 'FAMILY_COMPROMISED' },
              });
            }
            return { outcome: 'REUSED' } as const;
          }
          if (
            token.family.revokedAt ||
            token.family.accountId !== token.accountId ||
            !token.account.phoneVerifiedAt ||
            token.account.disabledAt
          )
            return { outcome: 'REJECTED' } as const;
          const consumed = await tx.webRefreshToken.updateMany({
            where: { id: token.id, revokedAt: null, expiresAt: { gt: now } },
            data: { revokedAt: now, consumedAt: now, revocationReason: 'ROTATED' },
          });
          if (consumed.count !== 1) return { outcome: 'CONCURRENT' } as const;
          await tx.webRefreshToken.create({
            data: {
              ...replacement,
              accountId: token.accountId,
              familyId: token.familyId,
              parentTokenId: token.id,
            },
          });
          return { outcome: 'ROTATED', account: token.account } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isConcurrentRefreshTransaction(error)) return { outcome: 'CONCURRENT' } as const;
      throw error;
    }
  }
  async revokeRefreshToken(tokenHash: string, now: Date) {
    await this.prisma.webRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now, revocationReason: 'LOGOUT' },
    });
  }
}

function isConcurrentRefreshTransaction(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;

  return error.meta?.code === '40001';
}
