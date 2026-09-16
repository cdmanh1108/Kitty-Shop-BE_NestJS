import { CLOCK, type Clock } from '@common/clock/clock';
import type { AppConfiguration } from '@config/configuration';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { OTP_PROVIDER, type OtpProvider } from '../domain/otp-provider';
import { normalizeWebPhone } from '../domain/phone';
import {
  WEB_AUTH_REPOSITORY,
  PhoneAlreadyRegisteredError,
  type WebAuthRepository,
  type OtpChallenge,
  type WebAccount,
  type WebProfile,
  type WebRefreshTokenData,
} from '../domain/web-auth.repository';

export interface CredentialsInput {
  phone: string;
  password: string;
}
export interface ChallengeResult {
  challengeId: string;
  phone: string;
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
  INVALID_PHONE_NUMBER: 'Số điện thoại di động Việt Nam không hợp lệ.',
  INVALID_PASSWORD: 'Mật khẩu cần từ 8 đến 64 ký tự và tối đa 72 byte.',
  PHONE_ALREADY_REGISTERED: 'Số điện thoại đã được đăng ký. Vui lòng đăng nhập để tiếp tục.',
  INVALID_CREDENTIALS: 'Số điện thoại hoặc mật khẩu không chính xác.',
  PHONE_NOT_VERIFIED: 'Tài khoản chưa xác thực số điện thoại.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị vô hiệu hóa.',
  AUTH_REQUIRED: 'Vui lòng đăng nhập để tiếp tục.',
  OTP_CHALLENGE_NOT_FOUND: 'Không tìm thấy yêu cầu xác thực. Vui lòng yêu cầu mã mới.',
  OTP_EXPIRED: 'Mã xác thực đã hết hạn. Vui lòng gửi lại mã.',
  OTP_ATTEMPTS_EXCEEDED: 'Đã hết số lần thử. Vui lòng gửi lại mã.',
  OTP_CONSUMED: 'Mã xác thực đã được sử dụng. Vui lòng yêu cầu mã mới.',
  OTP_INVALID: 'Mã xác thực không chính xác.',
  OTP_RESEND_TOO_SOON: 'Vui lòng chờ trước khi gửi lại mã xác thực.',
  PHONE_ALREADY_VERIFIED: 'Số điện thoại đã được xác thực. Vui lòng đăng nhập.',
};
export function authError(code: string, status = 400): never {
  throw new HttpException(
    { code, message: messages[code] ?? 'Không thể hoàn tất yêu cầu.' },
    status,
  );
}

@Injectable()
export class WebAuthService {
  constructor(
    @Inject(WEB_AUTH_REPOSITORY) private readonly repository: WebAuthRepository,
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<AppConfiguration, true>,
    private readonly jwt: JwtService,
  ) {}
  async register(input: CredentialsInput): Promise<ChallengeResult> {
    const phone = this.phone(input.phone);
    this.validatePassword(input.password);
    const existing = await this.repository.findAccount(phone);
    if (existing) {
      if (!existing.phoneVerifiedAt && !existing.disabledAt) authError('PHONE_NOT_VERIFIED', 409);
      authError('PHONE_ALREADY_REGISTERED', 409);
    }
    const code = this.otp.generateCode();
    let challenge: OtpChallenge;
    try {
      challenge = await this.repository.register(
        phone,
        await hash(input.password, 12),
        this.challenge(code),
      );
    } catch (error) {
      if (error instanceof PhoneAlreadyRegisteredError) {
        const racedAccount = await this.repository.findAccount(phone);
        if (racedAccount && !racedAccount.phoneVerifiedAt && !racedAccount.disabledAt)
          authError('PHONE_NOT_VERIFIED', 409);
        authError('PHONE_ALREADY_REGISTERED', 409);
      }
      throw error;
    }
    await this.otp.send(phone, code, challenge.id);
    return this.challengeResult(phone, challenge);
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
  async resend(rawPhone: string): Promise<ChallengeResult> {
    const phone = this.phone(rawPhone);
    const code = this.otp.generateCode();
    const result = await this.repository.resend(phone, this.challenge(code), this.clock.now());
    if ('error' in result)
      authError(result.error, result.error === 'OTP_RESEND_TOO_SOON' ? 429 : 400);
    await this.otp.send(phone, code, result.challenge.id);
    return this.challengeResult(phone, result.challenge);
  }
  async login(
    input: CredentialsInput,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<WebTokenResult> {
    const phone = this.phone(input.phone);
    this.validatePassword(input.password);
    const account = await this.repository.findAccount(phone);
    // Same bcrypt work for missing accounts; verification state is revealed only after password proof.
    const dummyHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5bH5XmGYWlkJKMYRnHX4CILJQUPB6eW';
    const valid = await compare(input.password, account?.passwordHash ?? dummyHash);
    if (!account || !valid) authError('INVALID_CREDENTIALS', 401);
    if (account.disabledAt) authError('ACCOUNT_DISABLED', 403);
    if (!account.phoneVerifiedAt) authError('PHONE_NOT_VERIFIED', 403);
    const refresh = this.prepareRefresh(context);
    if (!(await this.repository.createRefreshToken({ ...refresh.data, accountId: account.id })))
      authError('AUTH_REQUIRED', 401);
    return this.issueTokens(account, refresh.rawToken, refresh.data.expiresAt);
  }
  async refresh(
    rawToken: string | undefined,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<WebTokenResult> {
    if (!rawToken || !/^[A-Za-z0-9_-]{64}$/.test(rawToken)) authError('AUTH_REQUIRED', 401);
    const replacement = this.prepareRefresh(context);
    const account = await this.repository.rotateRefreshToken(
      this.tokenHash(rawToken),
      replacement.data,
      this.clock.now(),
    );
    if (!account) authError('AUTH_REQUIRED', 401);
    return this.issueTokens(account, replacement.rawToken, replacement.data.expiresAt);
  }
  async logout(token: string | undefined): Promise<void> {
    if (token && /^[A-Za-z0-9_-]{64}$/.test(token))
      await this.repository.revokeRefreshToken(this.tokenHash(token), this.clock.now());
  }
  async accountForAccessToken(accountId: string): Promise<WebProfile> {
    const account = await this.repository.findAccountById(accountId);
    if (!account?.phoneVerifiedAt || account.disabledAt) authError('AUTH_REQUIRED', 401);
    return this.profile(account);
  }
  private phone(raw: string): string {
    return normalizeWebPhone(raw) ?? authError('INVALID_PHONE_NUMBER');
  }
  private validatePassword(password: string): void {
    if (password.length < 8 || password.length > 64 || Buffer.byteLength(password, 'utf8') > 72)
      authError('INVALID_PASSWORD');
  }
  private challenge(code: string) {
    const now = this.clock.now();
    const settings = this.config.get('webAuth', { infer: true });
    const id = randomUUID();
    return {
      id,
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
  private challengeResult(phone: string, challenge: OtpChallenge): ChallengeResult {
    return {
      challengeId: challenge.id,
      phone,
      expiresAt: challenge.expiresAt.toISOString(),
      resendAvailableAt: challenge.resendAvailableAt.toISOString(),
    };
  }
  private profile(account: WebAccount): WebProfile {
    return {
      id: account.id,
      phone: account.phone,
      phoneVerifiedAt: account.phoneVerifiedAt,
      createdAt: account.createdAt,
    };
  }
}
