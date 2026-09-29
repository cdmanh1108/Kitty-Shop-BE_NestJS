import { CLOCK, type Clock } from '@common/clock/clock';
import type { AppConfiguration } from '@config/configuration';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import {
  WEB_AUTH_REPOSITORY,
  type WebAuthRepository,
  type WebAccount,
  type WebProfile,
  type WebRefreshTokenData,
} from '../domain/web-auth.repository';
import type { CredentialsInput, WebSessionContext, WebTokenResult } from './web-auth.contracts';
import { normalizeWebAuthEmail, validateWebAuthPassword } from './web-auth.credentials';
import { authError } from './web-auth.errors';

@Injectable()
export class WebSessionService {
  constructor(
    @Inject(WEB_AUTH_REPOSITORY) private readonly repository: WebAuthRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<AppConfiguration, true>,
    private readonly jwt: JwtService,
  ) {}

  async login(input: CredentialsInput, context: WebSessionContext): Promise<WebTokenResult> {
    const email = normalizeWebAuthEmail(input.email);
    validateWebAuthPassword(input.password);
    const account = await this.repository.findAccountByEmail(email);
    // Keep the same bcrypt work for missing accounts to avoid an enumeration oracle.
    const dummyHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5bH5XmGYWlkJKMYRnHX4CILJQUPB6eW';
    const valid = await compare(input.password, account?.passwordHash ?? dummyHash);
    if (!account || !valid) authError('INVALID_CREDENTIALS', 401);
    if (account.disabledAt) authError('ACCOUNT_DISABLED', 403);
    if (!account.emailVerifiedAt) authError('EMAIL_NOT_VERIFIED', 403);

    const refresh = this.prepareRefresh(context);
    if (
      !(await this.repository.createRefreshToken({
        ...refresh.data,
        accountId: account.id,
        familyId: randomUUID(),
      }))
    )
      authError('AUTH_REQUIRED', 401);
    return this.issueTokens(account, refresh.rawToken, refresh.data.expiresAt);
  }

  async refresh(rawToken: string | undefined, context: WebSessionContext): Promise<WebTokenResult> {
    if (!rawToken || !/^[A-Za-z0-9_-]{64}$/.test(rawToken)) authError('AUTH_REQUIRED', 401);
    const replacement = this.prepareRefresh(context);
    const rotation = await this.repository.rotateRefreshToken(
      this.tokenHash(rawToken),
      replacement.data,
      this.clock.now(),
    );
    if (rotation.outcome !== 'ROTATED') authError('AUTH_REQUIRED', 401);
    return this.issueTokens(rotation.account, replacement.rawToken, replacement.data.expiresAt);
  }

  async logout(token: string | undefined): Promise<void> {
    if (token && /^[A-Za-z0-9_-]{64}$/.test(token))
      await this.repository.revokeRefreshToken(this.tokenHash(token), this.clock.now());
  }

  async accountForAccessToken(accountId: string): Promise<WebProfile> {
    const account = await this.repository.findAccountById(accountId);
    // A valid pre-migration JWT remains usable for a legacy row with no email.
    if (!account || account.disabledAt || (account.email !== null && !account.emailVerifiedAt))
      authError('AUTH_REQUIRED', 401);
    return this.profile(account);
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private prepareRefresh(context: WebSessionContext) {
    const rawToken = randomBytes(48).toString('base64url');
    const data: WebRefreshTokenData = {
      tokenHash: this.tokenHash(rawToken),
      expiresAt: new Date(
        this.clock.now().getTime() +
          this.config.get('webAuth', { infer: true }).refreshTokenTtlDays * 86_400_000,
      ),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    };
    return { rawToken, data };
  }

  private async issueTokens(
    account: WebAccount,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<WebTokenResult> {
    const settings = this.config.get('webAuth', { infer: true });
    const accessToken = await this.jwt.signAsync(
      { sub: account.id, surface: 'web' },
      {
        algorithm: 'HS256',
        issuer: 'kitty-api',
        audience: 'kitty-web',
        expiresIn: settings.accessTtlSeconds,
      },
    );
    return {
      user: this.profile(account),
      accessToken,
      accessExpiresAt: new Date(this.clock.now().getTime() + settings.accessTtlSeconds * 1000),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private profile(account: WebAccount): WebProfile {
    return {
      id: account.id,
      email: account.email,
      emailVerifiedAt: account.emailVerifiedAt,
      createdAt: account.createdAt,
    };
  }
}
