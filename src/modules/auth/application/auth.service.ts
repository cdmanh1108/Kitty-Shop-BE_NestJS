import type { CurrentUser, JwtAccessPayload } from '@common/types/current-user';
import type { AppConfiguration } from '@config/configuration';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { AUTH_REPOSITORY, type AuthIdentity, type AuthRepository } from '../domain/auth.repository';
import type { ChangePasswordInput, LoginInput, LoginResult } from './auth.contracts';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {}

  async login(
    input: LoginInput,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginResult> {
    const identity = await this.repository.findIdentityByEmail(input.email, input.shopCode);
    if (
      !identity?.passwordHash ||
      identity.userStatus !== 'ACTIVE' ||
      identity.memberStatus !== 'ACTIVE' ||
      !(await compare(input.password, identity.passwordHash))
    ) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác.');
    }

    await this.repository.updateLastLogin(identity.userId);
    const refresh = this.prepareRefreshToken(context);
    const result = await this.issueSession(identity, refresh.rawToken);
    await this.repository.createRefreshToken({
      ...refresh.data,
      userId: identity.userId,
      memberId: identity.memberId,
    });
    return result;
  }

  async refresh(
    rawToken: string,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginResult> {
    const refresh = this.prepareRefreshToken(context);
    const identity = await this.repository.rotateRefreshToken(
      this.hashToken(rawToken),
      refresh.data,
    );
    if (!identity) {
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }
    return this.issueSession(identity, refresh.rawToken);
  }

  async logout(user: CurrentUser, rawToken: string): Promise<void> {
    await this.repository.revokeRefreshToken(this.hashToken(rawToken), user.userId, user.memberId);
  }

  me(user: CurrentUser): CurrentUser {
    return user;
  }

  async changePassword(user: CurrentUser, input: ChangePasswordInput): Promise<{ success: true }> {
    const currentHash = await this.repository.findPasswordHash(
      user.userId,
      user.memberId,
      user.shopId,
    );
    if (!currentHash || !(await compare(input.currentPassword, currentHash))) {
      throw new UnauthorizedException('Mật khẩu hiện tại không chính xác.');
    }
    if (await compare(input.newPassword, currentHash)) {
      throw new UnauthorizedException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }
    await this.repository.updatePasswordAndRevokeSessions(
      user.userId,
      await hash(input.newPassword, 12),
    );
    return { success: true };
  }

  private async issueSession(identity: AuthIdentity, refreshToken: string): Promise<LoginResult> {
    const ttlSeconds = this.config.get('jwtAccessTtlSeconds', { infer: true });
    const payload: JwtAccessPayload = {
      sub: identity.userId,
      mid: identity.memberId,
      sid: identity.shopId,
      surface: 'admin',
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: ttlSeconds,
      algorithm: 'HS256',
      issuer: 'kitty-api',
      audience: 'kitty-admin',
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

  private prepareRefreshToken(context: { ipAddress?: string; userAgent?: string }) {
    const rawToken = randomBytes(48).toString('base64url');
    return {
      rawToken,
      data: {
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(
          Date.now() + this.config.get('refreshTokenTtlDays', { infer: true }) * 86_400_000,
        ),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
