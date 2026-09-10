import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { AppConfiguration } from '@config/configuration';
import type { CurrentUser, JwtAccessPayload } from '@common/types/current-user';
import { AUTH_REPOSITORY, type AuthIdentity, type AuthRepository } from '../domain/auth.repository';
import type { ChangePasswordReqDto, LoginReqDto, LoginResDto } from '../api/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {}

  async login(
    input: LoginReqDto,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginResDto> {
    const identity = await this.repository.findIdentityByEmail(input.email, input.shopCode);
    if (
      !identity?.passwordHash ||
      identity.userStatus !== 'ACTIVE' ||
      identity.memberStatus !== 'ACTIVE' ||
      !(await compare(input.password, identity.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.repository.updateLastLogin(identity.userId);
    return this.issueSession(identity, context);
  }

  async refresh(
    rawToken: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginResDto> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.repository.consumeRefreshToken(tokenHash);
    if (
      !stored ||
      stored.expiresAt.getTime() <= Date.now() ||
      stored.identity.userStatus !== 'ACTIVE' ||
      stored.identity.memberStatus !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.issueSession(stored.identity, context);
  }

  async logout(rawToken: string): Promise<void> {
    await this.repository.revokeRefreshToken(this.hashToken(rawToken));
  }

  me(user: CurrentUser): CurrentUser {
    return user;
  }

  async changePassword(user: CurrentUser, input: ChangePasswordReqDto): Promise<{ success: true }> {
    const currentHash = await this.repository.findPasswordHash(user.userId, user.memberId, user.shopId);
    if (!currentHash || !(await compare(input.currentPassword, currentHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await compare(input.newPassword, currentHash)) {
      throw new UnauthorizedException('New password must be different from the current password');
    }
    await this.repository.updatePasswordAndRevokeSessions(user.userId, await hash(input.newPassword, 12));
    return { success: true };
  }

  private async issueSession(
    identity: AuthIdentity,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginResDto> {
    const ttlSeconds = this.config.get('jwtAccessTtlSeconds', { infer: true });
    const payload: JwtAccessPayload = {
      sub: identity.userId,
      mid: identity.memberId,
      sid: identity.shopId,
    };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ttlSeconds });

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('refreshTokenTtlDays', { infer: true }) * 86_400_000,
    );
    await this.repository.createRefreshToken({
      userId: identity.userId,
      memberId: identity.memberId,
      tokenHash: this.hashToken(refreshToken),
      expiresAt,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      user: {
        userId: identity.userId,
        memberId: identity.memberId,
        shopId: identity.shopId,
        email: identity.email,
        fullName: identity.fullName,
        permissions: identity.permissions,
      },
      tokens: { accessToken, refreshToken, expiresIn: ttlSeconds },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
