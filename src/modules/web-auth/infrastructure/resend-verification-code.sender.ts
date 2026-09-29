import type { AppConfiguration } from '@config/configuration';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Resend, type CreateEmailOptions, type CreateEmailResponse } from 'resend';
import {
  VerificationCodeDeliveryError,
  type VerificationCodeSender,
} from '../domain/verification-code';

export const RESEND_EMAIL_CLIENT = Symbol('RESEND_EMAIL_CLIENT');

export interface ResendEmailClient {
  sendEmail(payload: CreateEmailOptions, idempotencyKey: string): Promise<CreateEmailResponse>;
}

export function createResendEmailClient(apiKey: string): ResendEmailClient {
  const resend = new Resend(apiKey);
  return {
    sendEmail: (payload, idempotencyKey) => resend.emails.send(payload, { idempotencyKey }),
  };
}

export class ResendVerificationCodeSender implements VerificationCodeSender {
  private readonly logger = new Logger(ResendVerificationCodeSender.name);

  constructor(
    private readonly client: ResendEmailClient,
    private readonly config: ConfigService<AppConfiguration, true>,
  ) {}

  async send(destination: string, code: string, challengeId: string): Promise<void> {
    const settings = this.config.get('email', { infer: true });
    const ttlSeconds = this.config.get('webAuth', { infer: true }).otpTtlSeconds;
    const ttlLabel = formatTtl(ttlSeconds);
    const escapedCode = escapeHtml(code);
    const payload: CreateEmailOptions = {
      from: `${settings.fromName} <${settings.fromAddress}>`,
      to: destination,
      subject: 'Mã xác thực tài khoản Kitty',
      text: [
        'Xin chào,',
        '',
        'Mã xác thực tài khoản Kitty của bạn là:',
        '',
        code,
        '',
        `Mã này sẽ hết hạn sau ${ttlLabel}.`,
        'Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email này.',
        '',
        'Kitty',
      ].join('\n'),
      html: [
        '<!doctype html>',
        '<html lang="vi"><body style="margin:0;background:#f7f7f8;font-family:Arial,sans-serif;color:#202124">',
        '<main style="max-width:520px;margin:32px auto;padding:32px;background:#fff;border-radius:12px">',
        '<h1 style="font-size:22px;margin:0 0 24px">Xác thực tài khoản Kitty</h1>',
        '<p>Xin chào,</p>',
        '<p>Mã xác thực tài khoản Kitty của bạn là:</p>',
        `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${escapedCode}</p>`,
        `<p>Mã này sẽ hết hạn sau ${ttlLabel}.</p>`,
        '<p>Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email này.</p>',
        '<p style="margin-top:32px">Kitty</p>',
        '</main></body></html>',
      ].join(''),
    };

    try {
      const response = await this.client.sendEmail(payload, `verification-code-${challengeId}`);
      if (response.error) {
        const providerCode = safeProviderCode(response.error.name);
        const statusCode = safeStatusCode(response.error.statusCode);
        this.logger.warn(
          `Resend rejected verification email; providerCode=${providerCode}; statusCode=${statusCode ?? 'unknown'}`,
        );
        throw new VerificationCodeDeliveryError('provider_rejected');
      }
    } catch (error) {
      if (error instanceof VerificationCodeDeliveryError) throw error;
      this.logger.warn('Resend verification email request failed; providerCode=unavailable');
      throw new VerificationCodeDeliveryError('provider_unavailable');
    }
  }
}

function formatTtl(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${seconds} giây`;
  if (remainder === 0) return `${minutes} phút`;
  return `${minutes} phút ${remainder} giây`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function safeProviderCode(value: unknown): string {
  return typeof value === 'string' && /^[a-z_]{1,64}$/.test(value) ? value : 'unknown';
}

function safeStatusCode(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}
