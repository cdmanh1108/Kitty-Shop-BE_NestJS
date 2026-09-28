import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Clock } from '../../src/common/clock/clock';
import type { AppConfiguration } from '../../src/config/configuration';
import { AuthCleanupService } from '../../src/modules/auth-cleanup/application/auth-cleanup.service';
import { PrismaAuthCleanupCoordinator } from '../../src/modules/auth-cleanup/infrastructure/prisma-auth-cleanup.coordinator';
import { PrismaAuthCleanupRepository } from '../../src/modules/auth-cleanup/infrastructure/prisma-auth-cleanup.repository';
import { PrismaAuthRepository } from '../../src/modules/auth/infrastructure/prisma-auth.repository';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { createTestShop, createTestUserAndMember } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

const now = new Date('2026-09-28T00:00:00.000Z');
const clock: Clock = { now: () => new Date(now) };
const recent = (milliseconds: number): Date => new Date(now.getTime() - milliseconds);
const oldRefresh = (): Date => recent(31 * 24 * 60 * 60 * 1000);
const oldOtp = (): Date => recent(25 * 60 * 60 * 1000);
let otpAccountSequence = 0;

class Deferred {
  readonly promise: Promise<void>;
  resolve!: () => void;

  constructor() {
    this.promise = new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }
}

describe('auth ephemeral-data cleanup', () => {
  let prisma: PrismaService;
  let service: AuthCleanupService;
  let userId: string;
  let memberId: string;
  let shopId: string;
  let accountId: string;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    const shop = await createTestShop(prisma);
    shopId = shop.id;
    const principal = await createTestUserAndMember(prisma, shop.id);
    userId = principal.user.id;
    memberId = principal.member.id;
    accountId = (
      await prisma.webAccount.create({
        data: {
          phone: '+84912345678',
          passwordHash: 'hash',
          phoneVerifiedAt: now,
        },
      })
    ).id;
    const config = new ConfigService<AppConfiguration, true>();
    config.set('authCleanup', {
      enabled: true,
      refreshTokenRetentionDays: 30,
      otpRetentionHours: 24,
      batchSize: 2,
    });
    service = new AuthCleanupService(
      new PrismaAuthCleanupRepository(prisma),
      new PrismaAuthCleanupCoordinator(prisma),
      clock,
      config,
    );
  });

  afterAll(disconnectTestDatabase);

  async function adminFamily(
    terminalAt: Date | null,
    options?: { active?: boolean; child?: boolean; compromised?: boolean },
  ): Promise<{ familyId: string; tokenHash: string; childHash?: string }> {
    const familyId = randomUUID();
    const tokenHash = randomUUID().replaceAll('-', '').padEnd(64, 'a');
    const active = options?.active ?? false;
    await prisma.refreshTokenFamily.create({
      data: {
        id: familyId,
        userId,
        memberId,
        createdAt: terminalAt ?? recent(60 * 24 * 60 * 60 * 1000),
        ...(options?.compromised && terminalAt
          ? {
              revokedAt: terminalAt,
              reuseDetectedAt: terminalAt,
              revocationReason: 'REUSE_DETECTED',
            }
          : {}),
      },
    });
    const parent = await prisma.refreshToken.create({
      data: {
        userId,
        memberId,
        familyId,
        tokenHash,
        expiresAt:
          active || options?.child
            ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
            : (terminalAt ?? now),
        ...(active
          ? {}
          : {
              revokedAt: terminalAt ?? now,
              consumedAt: terminalAt ?? now,
              revocationReason: 'ROTATED',
            }),
      },
    });
    if (!options?.child) return { familyId, tokenHash };
    const childHash = randomUUID().replaceAll('-', '').padEnd(64, 'b');
    await prisma.refreshToken.create({
      data: {
        userId,
        memberId,
        familyId,
        parentTokenId: parent.id,
        tokenHash: childHash,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    return { familyId, tokenHash, childHash };
  }

  async function webFamily(terminalAt: Date | null, active = false): Promise<string> {
    const familyId = randomUUID();
    await prisma.webRefreshTokenFamily.create({
      data: { id: familyId, accountId, createdAt: terminalAt ?? recent(60 * 24 * 60 * 60 * 1000) },
    });
    await prisma.webRefreshToken.create({
      data: {
        accountId,
        familyId,
        tokenHash: randomUUID().replaceAll('-', '').padEnd(64, 'c'),
        expiresAt: active ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : (terminalAt ?? now),
        ...(active ? {} : { revokedAt: terminalAt ?? now, revocationReason: 'LOGOUT' }),
      },
    });
    return familyId;
  }

  async function otp(terminalAt: Date | null, consumed = false): Promise<string> {
    const otpAccount = await prisma.webAccount.create({
      data: {
        phone: `+8492234567${++otpAccountSequence}`,
        passwordHash: 'hash',
        phoneVerifiedAt: now,
      },
    });
    return (
      await prisma.webOtpChallenge.create({
        data: {
          id: randomUUID(),
          accountId: otpAccount.id,
          otpHash: randomUUID().replaceAll('-', '').padEnd(64, 'd'),
          expiresAt: terminalAt ?? new Date(now.getTime() + 60 * 60 * 1000),
          resendAvailableAt: now,
          ...(consumed && terminalAt ? { consumedAt: terminalAt } : {}),
        },
      })
    ).id;
  }

  it('retains active and recent security records while purging only whole expired families and old OTPs', async () => {
    const activeAdmin = await adminFamily(null, { active: true });
    const recentExpiredAdmin = await adminFamily(recent(24 * 60 * 60 * 1000));
    const oldAdmin = await adminFamily(oldRefresh());
    const retainedLineage = await adminFamily(recent(24 * 60 * 60 * 1000), { child: true });
    const recentCompromised = await adminFamily(recent(24 * 60 * 60 * 1000), { compromised: true });
    const oldCompromised = await adminFamily(oldRefresh(), { compromised: true });
    const activeWeb = await webFamily(null, true);
    const oldWeb = await webFamily(oldRefresh());
    const activeOtp = await otp(null);
    const recentExpiredOtp = await otp(recent(60 * 60 * 1000));
    const oldExpiredOtp = await otp(oldOtp());
    const oldConsumedOtp = await otp(oldOtp(), true);
    const anotherOldExpiredOtp = await otp(oldOtp());

    await expect(service.cleanupNow()).resolves.toMatchObject({
      adminRefreshFamiliesDeleted: 2,
      webRefreshFamiliesDeleted: 1,
      otpChallengesDeleted: 3,
    });

    await expect(
      prisma.refreshTokenFamily.findUnique({ where: { id: activeAdmin.familyId } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.refreshTokenFamily.findUnique({ where: { id: recentExpiredAdmin.familyId } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.refreshTokenFamily.findUnique({ where: { id: oldAdmin.familyId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.refreshTokenFamily.findUnique({ where: { id: retainedLineage.familyId } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.refreshTokenFamily.findUnique({ where: { id: recentCompromised.familyId } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.refreshTokenFamily.findUnique({ where: { id: oldCompromised.familyId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.webRefreshTokenFamily.findUnique({ where: { id: activeWeb } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.webRefreshTokenFamily.findUnique({ where: { id: oldWeb } }),
    ).resolves.toBeNull();
    await expect(
      prisma.webOtpChallenge.findUnique({ where: { id: activeOtp } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.webOtpChallenge.findUnique({ where: { id: recentExpiredOtp } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.webOtpChallenge.findUnique({ where: { id: oldExpiredOtp } }),
    ).resolves.toBeNull();
    await expect(
      prisma.webOtpChallenge.findUnique({ where: { id: oldConsumedOtp } }),
    ).resolves.toBeNull();
    await expect(
      prisma.webOtpChallenge.findUnique({ where: { id: anotherOldExpiredOtp } }),
    ).resolves.toBeNull();
  });

  it('keeps a retained rotated parent usable for Task 09 reuse detection, then remains idempotent', async () => {
    const family = await adminFamily(recent(24 * 60 * 60 * 1000), { child: true });
    await expect(service.cleanupNow()).resolves.toMatchObject({ adminRefreshFamiliesDeleted: 0 });
    const repository = new PrismaAuthRepository(prisma);
    await expect(
      repository.rotateRefreshToken(
        family.tokenHash,
        { tokenHash: randomUUID().replaceAll('-', '').padEnd(64, 'e'), expiresAt: now },
        shopId,
        now,
      ),
    ).resolves.toEqual({ outcome: 'REUSED' });
    await expect(
      prisma.refreshTokenFamily.findUniqueOrThrow({ where: { id: family.familyId } }),
    ).resolves.toMatchObject({
      revocationReason: 'REUSE_DETECTED',
    });
    await expect(service.cleanupNow()).resolves.toMatchObject({ adminRefreshFamiliesDeleted: 0 });
  });

  it('uses the shared database lease to prevent overlapping cleanup owners', async () => {
    const firstCoordinator = new PrismaAuthCleanupCoordinator(prisma);
    const secondCoordinator = new PrismaAuthCleanupCoordinator(prisma);
    const entered = new Deferred();
    const release = new Deferred();
    const first = firstCoordinator.runIfOwner(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    await expect(
      secondCoordinator.runIfOwner(() => Promise.resolve(undefined)),
    ).resolves.toMatchObject({
      acquired: false,
    });
    release.resolve();
    await expect(first).resolves.toMatchObject({ acquired: true });
  });
});
