import { CLOCK, type Clock } from '@common/clock/clock';
import type { AppConfiguration } from '@config/configuration';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { createHmac, randomUUID } from 'node:crypto';
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
  type ChallengeIssueIntent,
  type ChallengeIssueRequest,
} from '../domain/web-auth.repository';
import type { ChallengeResult, CredentialsInput } from './web-auth.contracts';
import { normalizeWebAuthEmail, validateWebAuthPassword } from './web-auth.credentials';
import { authError } from './web-auth.errors';

@Injectable()
export class WebRegistrationService {
  constructor(
    @Inject(WEB_AUTH_REPOSITORY) private readonly repository: WebAuthRepository,
    @Inject(VERIFICATION_CODE_GENERATOR)
    private readonly codeGenerator: VerificationCodeGenerator,
    @Inject(VERIFICATION_CODE_SENDER)
    private readonly codeSender: VerificationCodeSender,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {}

  async register(input: CredentialsInput): Promise<ChallengeResult> {
    const email = normalizeWebAuthEmail(input.email);
    validateWebAuthPassword(input.password);
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

  private challengeResult(email: string, challenge: OtpChallenge): ChallengeResult {
    return {
      challengeId: challenge.id,
      email,
      expiresAt: challenge.expiresAt.toISOString(),
      resendAvailableAt: challenge.resendAvailableAt.toISOString(),
    };
  }
}
