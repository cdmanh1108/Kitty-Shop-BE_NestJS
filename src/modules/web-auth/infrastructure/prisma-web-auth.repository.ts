import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import {
  PhoneAlreadyRegisteredError,
  type WebAuthRepository,
  type NewChallenge,
  type VerifyResult,
  type ResendResult,
  type WebRefreshTokenData,
} from '../domain/web-auth.repository';

@Injectable()
export class PrismaWebAuthRepository implements WebAuthRepository {
  constructor(private readonly prisma: PrismaService) {}
  async register(phone: string, passwordHash: string, attemptId: string, challenge: NewChallenge) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.webAccount.findUnique({ where: { phone } });
        if (existing) {
          if (existing.phoneVerifiedAt || existing.disabledAt) throw new PhoneAlreadyRegisteredError();
          await tx.webOtpChallenge.updateMany({ where: { accountId: existing.id, consumedAt: null }, data: { consumedAt: challenge.createdAt } });
          await tx.webAccount.update({ where: { id: existing.id }, data: { pendingPasswordHash: passwordHash, registrationAttemptId: attemptId } });
          return tx.webOtpChallenge.create({ data: { ...challenge, accountId: existing.id } });
        }
        const account = await tx.webAccount.create({ data: { phone, passwordHash, pendingPasswordHash: passwordHash, registrationAttemptId: attemptId } });
        return tx.webOtpChallenge.create({ data: { ...challenge, accountId: account.id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new PhoneAlreadyRegisteredError();
      throw error;
    }
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
      // All verify/resend/session issuance mutations serialize on the account row.
      await tx.$queryRaw`SELECT id FROM web_accounts WHERE id = ${initial.accountId}::uuid FOR UPDATE`;
      const challenge = await tx.webOtpChallenge.findUniqueOrThrow({
        where: { id },
        include: { account: true },
      });
      if (challenge.account.disabledAt) return { error: 'ACCOUNT_DISABLED' };
      if (!challenge.registrationAttemptId || challenge.registrationAttemptId !== challenge.account.registrationAttemptId || !challenge.account.pendingPasswordHash)
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
        data: { passwordHash: challenge.account.pendingPasswordHash, pendingPasswordHash: null, registrationAttemptId: null, phoneVerifiedAt: now },
      });
      await tx.webOtpChallenge.updateMany({
        where: { accountId: challenge.accountId, consumedAt: null },
        data: { consumedAt: now },
      });
      return { verified: true };
    });
  }
  async resend(phone: string, challenge: NewChallenge, now: Date): Promise<ResendResult> {
    return this.prisma.$transaction(async (tx): Promise<ResendResult> => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM web_accounts WHERE phone = ${phone} FOR UPDATE`;
      const id = rows[0]?.id;
      if (!id) return { error: 'OTP_CHALLENGE_NOT_FOUND' };
      const account = await tx.webAccount.findUniqueOrThrow({ where: { id } });
      if (account.disabledAt) return { error: 'ACCOUNT_DISABLED' };
      if (account.phoneVerifiedAt) return { error: 'PHONE_ALREADY_VERIFIED' };
      if (!account.registrationAttemptId || !account.pendingPasswordHash)
        return { error: 'OTP_CHALLENGE_NOT_FOUND' };
      const previous = await tx.webOtpChallenge.findFirst({
        where: { accountId: id, consumedAt: null },
      });
      if (previous && previous.resendAvailableAt > now) return { error: 'OTP_RESEND_TOO_SOON' };
      await tx.webOtpChallenge.updateMany({
        where: { accountId: id, consumedAt: null },
        data: { consumedAt: now },
      });
      return {
        challenge: await tx.webOtpChallenge.create({
          data: { ...challenge, accountId: id, registrationAttemptId: account.registrationAttemptId },
        }),
      };
    });
  }
  async createRefreshToken(input: WebRefreshTokenData & { accountId: string }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM web_accounts WHERE id = ${input.accountId}::uuid FOR UPDATE`;
      const account = await tx.webAccount.findUnique({ where: { id: input.accountId } });
      if (!account?.phoneVerifiedAt || account.disabledAt) return false;
      await tx.webRefreshToken.create({ data: input });
      return true;
    });
  }
  async rotateRefreshToken(tokenHash: string, replacement: WebRefreshTokenData, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.webRefreshToken.findUnique({
        where: { tokenHash },
        include: { account: true },
      });
      if (
        !token ||
        token.revokedAt ||
        token.expiresAt <= now ||
        !token.account.phoneVerifiedAt ||
        token.account.disabledAt
      )
        return null;
      const consumed = await tx.webRefreshToken.updateMany({
        where: { id: token.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (consumed.count !== 1) return null;
      await tx.webRefreshToken.create({ data: { ...replacement, accountId: token.accountId } });
      return token.account;
    });
  }
  async revokeRefreshToken(tokenHash: string, now: Date) {
    await this.prisma.webRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
