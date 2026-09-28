import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type {
  AuthIdentity,
  AuthRepository,
  RefreshTokenData,
  CreateRefreshTokenData,
} from '../domain/auth.repository';

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findIdentityByEmail(email: string, shopId: string): Promise<AuthIdentity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          where: { shopId },
          include: {
            shop: true,
            memberRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
          take: 1,
        },
      },
    });
    const member = user?.memberships[0];
    if (!user || !member) return null;
    return this.mapIdentity(user, member);
  }

  async rotateRefreshToken(
    tokenHash: string,
    replacement: RefreshTokenData,
    shopId: string,
    now: Date,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE
        `;
          const tokenId = locked[0]?.id;
          if (!tokenId) return { outcome: 'REJECTED' } as const;
          const token = await tx.refreshToken.findUnique({
            where: { id: tokenId },
            include: {
              family: true,
              user: true,
              member: {
                include: {
                  shop: true,
                  memberRoles: {
                    include: {
                      role: {
                        include: {
                          rolePermissions: { include: { permission: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          if (!token || token.expiresAt <= now) return { outcome: 'REJECTED' } as const;

          if (token.revokedAt) {
            if (token.revocationReason !== 'ROTATED' || !token.consumedAt || token.family.revokedAt)
              return { outcome: 'REJECTED' } as const;
            const compromised = await tx.refreshTokenFamily.updateMany({
              where: { id: token.familyId, revokedAt: null },
              data: { revokedAt: now, revocationReason: 'REUSE_DETECTED', reuseDetectedAt: now },
            });
            if (compromised.count === 1) {
              await tx.refreshToken.updateMany({
                where: { familyId: token.familyId, revokedAt: null },
                data: { revokedAt: now, revocationReason: 'FAMILY_COMPROMISED' },
              });
            }
            return { outcome: 'REUSED' } as const;
          }
          if (
            token.family.revokedAt ||
            token.family.userId !== token.userId ||
            token.family.memberId !== token.memberId ||
            token.user.status !== 'ACTIVE' ||
            token.member.status !== 'ACTIVE' ||
            token.member.userId !== token.userId ||
            token.member.shopId !== shopId
          )
            return { outcome: 'REJECTED' } as const;

          // The row lock plus Serializable transaction makes a simultaneous request retry-safe:
          // one transaction rotates; the other returns CONCURRENT from the serialization conflict.
          const consumed = await tx.refreshToken.updateMany({
            where: { id: token.id, revokedAt: null, expiresAt: { gt: now } },
            data: { revokedAt: now, consumedAt: now, revocationReason: 'ROTATED' },
          });
          if (consumed.count !== 1) return { outcome: 'CONCURRENT' } as const;

          // Inserting the replacement must roll back consumption if persistence fails.
          await tx.refreshToken.create({
            data: {
              ...replacement,
              userId: token.userId,
              memberId: token.memberId,
              familyId: token.familyId,
              parentTokenId: token.id,
            },
          });
          return {
            outcome: 'ROTATED',
            identity: this.mapIdentity(token.user, token.member),
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isConcurrentRefreshTransaction(error)) return { outcome: 'CONCURRENT' } as const;
      throw error;
    }
  }

  async createRefreshToken(input: CreateRefreshTokenData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshTokenFamily.create({
        data: { id: input.familyId, userId: input.userId, memberId: input.memberId },
      });
      await tx.refreshToken.create({
        data: {
          userId: input.userId,
          memberId: input.memberId,
          familyId: input.familyId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });
    });
  }

  async revokeRefreshToken(tokenHash: string, userId: string, memberId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, userId, memberId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'LOGOUT' },
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  async findPasswordHash(userId: string, memberId: string, shopId: string): Promise<string | null> {
    const member = await this.prisma.shopMember.findFirst({
      where: { id: memberId, userId, shopId, status: 'ACTIVE', user: { status: 'ACTIVE' } },
      select: { user: { select: { passwordHash: true } } },
    });
    return member?.user.passwordHash ?? null;
  }

  async updatePasswordAndRevokeSessions(userId: string, passwordHash: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshTokenFamily.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'PASSWORD_CHANGED' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'PASSWORD_CHANGED' },
      }),
    ]);
  }

  private mapIdentity(
    user: {
      id: string;
      email: string | null;
      fullName: string;
      passwordHash: string | null;
      status: string;
    },
    member: {
      id: string;
      shopId: string;
      status: string;
      memberRoles: Array<{
        role: { rolePermissions: Array<{ permission: { code: string } }> };
      }>;
    },
  ): AuthIdentity {
    const permissions = new Set<string>();
    member.memberRoles.forEach(({ role }) =>
      role.rolePermissions.forEach(({ permission }) => permissions.add(permission.code)),
    );
    return {
      userId: user.id,
      memberId: member.id,
      shopId: member.shopId,
      email: user.email,
      fullName: user.fullName,
      passwordHash: user.passwordHash,
      userStatus: user.status,
      memberStatus: member.status,
      permissions: [...permissions],
    };
  }
}

function isConcurrentRefreshTransaction(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;

  return error.meta?.code === '40001';
}
