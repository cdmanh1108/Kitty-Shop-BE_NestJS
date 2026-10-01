import { CLOCK, type Clock } from '@common/clock/clock';
import type { AppConfiguration } from '@config/configuration';
import {
  APPLICATION_LOGGER,
  silentApplicationLog,
  type ApplicationLog,
  type ApplicationLoggerFactory,
} from '@common/logging/application-logger.port';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { createHmac, randomUUID } from 'node:crypto';
import {
  VERIFICATION_CODE_GENERATOR,
  VERIFICATION_CODE_SENDER,
  VerificationCodeDeliveryError,
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
import { webAuthError } from '../domain/web-auth.errors';

@Injectable()
export class WebRegistrationService {
  private readonly logger: ApplicationLog;

  constructor(
    @Inject(WEB_AUTH_REPOSITORY) private readonly repository: WebAuthRepository,
    @Inject(VERIFICATION_CODE_GENERATOR)
    private readonly codeGenerator: VerificationCodeGenerator,
    @Inject(VERIFICATION_CODE_SENDER)
    private readonly codeSender: VerificationCodeSender,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<AppConfiguration, true>,
    @Optional() @Inject(APPLICATION_LOGGER) loggerFactory?: ApplicationLoggerFactory,
  ) {
    this.logger = loggerFactory?.create(WebRegistrationService.name) ?? silentApplicationLog;
  }

  async register(input: CredentialsInput): Promise<ChallengeResult> {
    const email = normalizeWebAuthEmail(input.email);
    validateWebAuthPassword(input.password);
    const existing = await this.repository.findAccountByEmail(email);
    if (existing && (existing.emailVerifiedAt || existing.disabledAt))
      webAuthError('EMAIL_ALREADY_REGISTERED');

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
    if ('error' in result) webAuthError(result.error);
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
    const challenge = this.challenge(code, registrationAttemptId, now, request);
    const issueRequest: ChallengeIssueRequest = { ...request, challenge, now };
    const result = await this.repository.issueVerificationChallenge(issueRequest);
    if ('error' in result) {
      webAuthError(result.error);
    }
    const operation = request.kind;
    let fallbackFailureReason = 'provider_unavailable';
    try {
      await this.codeSender.send(result.email, code, result.challenge.id);
      fallbackFailureReason = 'delivery_state_update_failed';
      const accepted = await this.repository.markVerificationDeliverySent(
        result.challenge.id,
        this.clock.now(),
      );
      if (!accepted) throw new Error('Verification delivery state was not updated');
      this.logger.log(`Verification email accepted; operation=${operation}`);
    } catch (error) {
      const settings = this.config.get('webAuth', { infer: true });
      const retrySeconds = Math.min(
        settings.deliveryFailureRetrySeconds,
        settings.resendCooldownSeconds,
      );
      try {
        await this.repository.markVerificationDeliveryFailed(
          result.challenge.id,
          new Date(this.clock.now().getTime() + retrySeconds * 1000),
        );
      } catch {
        this.logger.error(
          `Could not persist verification delivery failure; operation=${operation}`,
        );
      }
      const reason =
        error instanceof VerificationCodeDeliveryError ? error.reason : fallbackFailureReason;
      this.logger.error(
        `Verification email delivery failed; operation=${operation}; reason=${reason}`,
      );
      webAuthError('VERIFICATION_DELIVERY_FAILED');
    }
    return this.challengeResult(result.email, result.challenge);
  }

  private challenge(
    code: string,
    registrationAttemptId: string | undefined,
    now: Date,
    request: ChallengeIssueIntent,
  ) {
    const settings = this.config.get('webAuth', { infer: true });
    const id = randomUUID();
    return {
      id,
      registrationAttemptId,
      otpHash: this.otpHash(id, code),
      createdAt: now,
      expiresAt: new Date(now.getTime() + settings.otpTtlSeconds * 1000),
      resendAvailableAt: new Date(now.getTime() + settings.resendCooldownSeconds * 1000),
      deliveryStatus: 'PENDING' as const,
      retryAnchorId: request.kind === 'resend' ? request.challengeId : null,
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
