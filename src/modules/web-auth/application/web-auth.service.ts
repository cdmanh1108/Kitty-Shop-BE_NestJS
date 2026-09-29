import { CLOCK, type Clock } from '@common/clock/clock';
import type { AppConfiguration } from '@config/configuration';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { normalizeWebEmail } from '../domain/email';
import {
  VERIFICATION_CODE_GENERATOR,
  VERIFICATION_CODE_SENDER,
  type VerificationCodeGenerator,
  type VerificationCodeSender,
} from '../domain/verification-code';
import {
  WEB_AUTH_REPOSITORY,
  type WebAuthRepository,
  type OtpChallenge,
  type WebAccount,
  type WebProfile,
  type WebRefreshTokenData,
  type ChallengeIssueIntent,
  type ChallengeIssueRequest,
} from '../domain/web-auth.repository';

export interface CredentialsInput {
  email: string;
  password: string;
}
export interface ChallengeResult {
  challengeId: string;
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
}
export interface WebTokenResult {
  user: WebProfile;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const messages: Record<string, string> = {
  INVALID_EMAIL: 'Please enter a valid email address.',
  INVALID_PASSWORD: 'Password must be 8 to 64 characters and at most 72 UTF-8 bytes.',
  EMAIL_ALREADY_REGISTERED: 'This email is already registered. Please sign in to continue.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  EMAIL_NOT_VERIFIED: 'This account email has not been verified.',
  ACCOUNT_DISABLED: 'This account is disabled.',
  AUTH_REQUIRED: 'Please sign in to continue.',
  OTP_CHALLENGE_NOT_FOUND: 'Verification request not found. Please request a new code.',
  OTP_EXPIRED: 'Verification code expired. Please request a new code.',
  OTP_ATTEMPTS_EXCEEDED: 'Too many attempts. Please request a new code.',
  OTP_CONSUMED: 'Verification code was already used. Please request a new code.',
  OTP_INVALID: 'Verification code is incorrect.',
  OTP_RESEND_TOO_SOON: 'Please wait before requesting another verification code.',
  EMAIL_ALREADY_VERIFIED: 'This email is already verified. Please sign in.',
};

export function authError(code: string, status = 400): never {
  throw new HttpException(
    { code, message: messages[code] ?? 'Could not complete the request.' },
    status,
  );
}

@Injectable()
export class WebAuthService {
  constructor(
    @Inject(WEB_AUTH_REPOSITORY) private readonly repository: WebAuthRepository,
    @Inject(VERIFICATION_CODE_GENERATOR)
    private readonly codeGenerator: VerificationCodeGenerator,
    @Inject(VERIFICATION_CODE_SENDER) private readonly codeSender: VerificationCodeSender,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<AppConfiguration, true>,
    private readonly jwt: JwtService,
  ) {}

  async register(input: CredentialsInput): Promise<ChallengeResult> {
    const email = this.email(input.email);
    this.validatePassword(input.password);
    const existing = await this.repository.findAccountByEmail(email);
    if (existing && (existing.emailVerifiedAt || existing.disabledAt))
      authError('EMAIL_ALREADY_REGISTERED', 409);

    return this.issueVerificationChallenge({
      kind: 'register',
      email,
      passwordHash: await hash(input.password, 12),
      attemptId: randomUUID(),
    });
  }

  async verify(challengeId: string, otp: string): Promise<{ verified: true }> {
    const result = await this.repository.verify(
      challengeId,
      this.otpHash(challengeId, otp),
      this.clock.now(),
      this.config.get('webAuth', { infer: true }).otpMaxAttempts,
    );
    if ('error' in result) authError(result.error);
    return result;
  }

  async resend(challengeId: string): Promise<ChallengeResult> {
    return this.issueVerificationChallenge({ kind: 'resend', challengeId });
  }

  private async issueVerificationChallenge(
    request: ChallengeIssueIntent,
  ): Promise<ChallengeResult> {
    const now = this.clock.now();
    const code = this.codeGenerator.generate();
    const registrationAttemptId = request.kind === 'register' ? request.attemptId : undefined;
    const challenge = this.challenge(code, registrationAttemptId, now);
    const issueRequest: ChallengeIssueRequest = { ...request, challenge, now };
    const result = await this.repository.issueVerificationChallenge(issueRequest);
    if ('error' in result) {
      const status =
        result.error === 'OTP_RESEND_TOO_SOON'
          ? 429
          : result.error === 'EMAIL_ALREADY_REGISTERED'
            ? 409
            : 400;
      authError(result.error, status);
    }
    await this.codeSender.send(result.email, code, result.challenge.id);
    return this.challengeResult(result.email, result.challenge);
  }

  async login(
    input: CredentialsInput,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<WebTokenResult> {
    const email = this.email(input.email);
    this.validatePassword(input.password);
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

  async refresh(
    rawToken: string | undefined,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<WebTokenResult> {
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

  private email(raw: string): string {
    return normalizeWebEmail(raw) ?? authError('INVALID_EMAIL');
  }

  private validatePassword(password: string): void {
    if (password.length < 8 || password.length > 64 || Buffer.byteLength(password, 'utf8') > 72)
      authError('INVALID_PASSWORD');
  }

  private challenge(code: string, registrationAttemptId: string | undefined, now: Date) {
    const settings = this.config.get('webAuth', { infer: true });
    const id = randomUUID();
    return {
      id,
      registrationAttemptId,
      otpHash: this.otpHash(id, code),
      createdAt: now,
      expiresAt: new Date(now.getTime() + settings.otpTtlSeconds * 1000),
      resendAvailableAt: new Date(now.getTime() + settings.resendCooldownSeconds * 1000),
    };
  }

  private otpHash(id: string, code: string): string {
    return createHmac('sha256', this.config.get('webAuth', { infer: true }).otpHashSecret)
      .update(`kitty-web-registration:${id}:${code}`)
      .digest('hex');
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private prepareRefresh(context: { ipAddress?: string; userAgent?: string }) {
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

  private challengeResult(email: string, challenge: OtpChallenge): ChallengeResult {
    return {
      challengeId: challenge.id,
      email,
      expiresAt: challenge.expiresAt.toISOString(),
      resendAvailableAt: challenge.resendAvailableAt.toISOString(),
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
