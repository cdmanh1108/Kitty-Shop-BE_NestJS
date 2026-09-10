import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import type {
  AuthIdentity,
  AuthRepository,
  StoredRefreshToken,
} from '../domain/auth.repository';

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findIdentityByEmail(email: string, shopCode?: string): Promise<AuthIdentity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          where: shopCode ? { shop: { code: shopCode } } : undefined,
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

  async consumeRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: {
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
      if (!token || token.revokedAt || token.expiresAt.getTime() <= Date.now()) return null;

      // Atomic consume: only one concurrent refresh can flip revokedAt from NULL.
      const consumed = await tx.refreshToken.updateMany({
        where: { id: token.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (consumed.count !== 1) return null;

      return {
        id: token.id,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt,
        identity: this.mapIdentity(token.user, token.member),
      };
    });
  }

  async createRefreshToken(input: {
    userId: string;
    memberId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        memberId: input.memberId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
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
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private mapIdentity(
    user: { id: string; email: string | null; fullName: string; passwordHash: string | null; status: string },
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
