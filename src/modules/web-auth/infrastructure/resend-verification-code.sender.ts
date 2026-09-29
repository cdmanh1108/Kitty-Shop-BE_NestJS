import type { AppConfiguration } from '@config/configuration';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Resend, type CreateEmailOptions, type CreateEmailResponse } from 'resend';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VerificationCodeDeliveryError,
  type VerificationCodeSender,
} from '../domain/verification-code';

export const RESEND_EMAIL_CLIENT = Symbol('RESEND_EMAIL_CLIENT');

const SHOP = {
  name: 'KITTY – Tiệm cho thuê đồ Cần Thơ',
  tagline: 'Thuê outfit xinh, nhẹ ví hơn.',
  services: 'Cho thuê trang phục · Máy ảnh · Make up',
  address: '23 Đường số 12, KDC Thới Nhựt 1, Tân An, Cần Thơ',
  mapsUrl: 'https://maps.app.goo.gl/gRK5QfsWDYv5DPkv7?g_st=ic',
  openingHours: '08:30–21:00, Thứ 2 đến Chủ nhật',
  phones: [
    { label: '0939 505 378', href: 'tel:0939505378' },
    { label: '0766 863 919', href: 'tel:0766863919' },
  ],
  tiktok: '@kitty.tiemthuedocantho',
  tiktokUrl: 'https://www.tiktok.com/@kitty.tiemthuedocantho',
} as const;

const LOGO_CONTENT_ID = 'kitty-brand-logo';
const LOGO_PATH = join(__dirname, 'assets', 'kitty-logo.jpg');

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
    const logoAttachment = readLogoAttachment();
    const payload: CreateEmailOptions = {
      from: `${settings.fromName} <${settings.fromAddress}>`,
      to: destination,
      subject: 'Mã xác thực tài khoản Kitty',
      text: renderVerificationText(code, ttlLabel),
      html: renderVerificationHtml(escapedCode, escapeHtml(ttlLabel), Boolean(logoAttachment)),
      ...(logoAttachment ? { attachments: [logoAttachment] } : {}),
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

function readLogoAttachment(): NonNullable<CreateEmailOptions['attachments']>[number] | undefined {
  try {
    return {
      filename: 'kitty-logo.jpg',
      contentType: 'image/jpeg',
      content: readFileSync(LOGO_PATH),
      contentId: LOGO_CONTENT_ID,
    };
  } catch {
    // The textual brand header remains visible if a deployment omits this optional asset.
    return undefined;
  }
}

function renderVerificationText(code: string, ttlLabel: string): string {
  return [
    'XÁC THỰC TÀI KHOẢN KITTY',
    '',
    'Xin chào,',
    'Mã xác thực tài khoản của bạn là:',
    '',
    code,
    '',
    `Mã sẽ hết hạn sau ${ttlLabel}. Vui lòng không chia sẻ mã này với người khác.`,
    'Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email.',
    '',
    SHOP.name,
    SHOP.tagline,
    SHOP.services,
    '',
    `Địa chỉ: ${SHOP.address}`,
    `Bản đồ: ${SHOP.mapsUrl}`,
    `Hotline: ${SHOP.phones.map((phone) => phone.label).join(' · ')}`,
    `Giờ mở cửa: ${SHOP.openingHours}`,
    `TikTok: ${SHOP.tiktokUrl}`,
  ].join('\n');
}

function renderVerificationHtml(code: string, ttlLabel: string, hasLogo: boolean): string {
  const logo = hasLogo
    ? `<img src="cid:${LOGO_CONTENT_ID}" width="96" height="96" alt="${escapeHtml(SHOP.name)}" style="display:block;width:96px;height:96px;object-fit:contain;border:0;margin:0 auto 12px">`
    : `<div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;letter-spacing:5px;font-weight:700;color:#673e4c">KITTY</div>`;
  const phoneLinks = SHOP.phones
    .map(
      (phone) =>
        `<a href="${escapeHtml(phone.href)}" style="color:#8f3d59;text-decoration:none;white-space:nowrap">${escapeHtml(phone.label)}</a>`,
    )
    .join('<span style="color:#cbb8c0">&nbsp;&nbsp;·&nbsp;&nbsp;</span>');

  return `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#fcf8f9;color:#30252a;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Mã xác thực Kitty có hiệu lực trong ${ttlLabel}. Vui lòng không chia sẻ mã này.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fcf8f9">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
          <tr><td align="center" style="padding:0 0 18px">
            ${logo}
            <div style="font-size:13px;line-height:20px;color:#77636c">${escapeHtml(SHOP.tagline)}</div>
          </td></tr>
          <tr><td style="background:#fff;border:1px solid #eadde2;border-radius:18px;padding:32px 28px 28px;box-shadow:0 8px 28px rgba(103,62,76,.07)">
            <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a34865">Tài khoản KITTY</div>
            <h1 style="margin:8px 0 12px;font-size:25px;line-height:32px;color:#30252a">Xác thực tài khoản của bạn</h1>
            <p style="margin:0 0 8px;font-size:15px;line-height:24px">Xin chào,</p>
            <p style="margin:0;font-size:15px;line-height:24px;color:#55464c">Nhập mã bên dưới để tiếp tục. Mã chỉ dùng một lần:</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 16px">
              <tr><td align="center" style="padding:20px 12px;background:#fcf8f9;border:1px solid #eddde4;border-radius:12px">
                <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.2px;color:#77636c">MÃ XÁC THỰC</div>
                <div style="padding-top:7px;font-size:34px;line-height:42px;font-weight:700;letter-spacing:9px;color:#8f3d59">${code}</div>
              </td></tr>
            </table>
            <p style="margin:0;font-size:14px;line-height:22px;color:#55464c">Mã có hiệu lực trong <strong style="color:#30252a">${ttlLabel}</strong>. Vui lòng không chia sẻ mã này với người khác.</p>
            <p style="margin:12px 0 0;font-size:13px;line-height:21px;color:#77636c">Nếu bạn không yêu cầu xác thực, hãy bỏ qua email này. Tài khoản của bạn sẽ không thay đổi.</p>
          </td></tr>
          <tr><td style="padding:22px 8px 0">
            <div style="font-size:16px;line-height:23px;font-weight:700;color:#673e4c">${escapeHtml(SHOP.name)}</div>
            <div style="padding-top:4px;font-size:13px;line-height:20px;color:#77636c">${escapeHtml(SHOP.services)}</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:14px;font-size:13px;line-height:21px;color:#55464c">
              <tr><td valign="top" width="88" style="padding:3px 8px 3px 0;color:#77636c">Địa chỉ</td><td style="padding:3px 0">${escapeHtml(SHOP.address)}<br><a href="${escapeHtml(SHOP.mapsUrl)}" style="color:#8f3d59;text-decoration:underline">Xem bản đồ</a></td></tr>
              <tr><td valign="top" style="padding:5px 8px 3px 0;color:#77636c">Hotline</td><td style="padding:5px 0 3px">${phoneLinks}</td></tr>
              <tr><td valign="top" style="padding:3px 8px 3px 0;color:#77636c">Giờ mở cửa</td><td style="padding:3px 0">${escapeHtml(SHOP.openingHours)}</td></tr>
              <tr><td valign="top" style="padding:3px 8px 3px 0;color:#77636c">TikTok</td><td style="padding:3px 0"><a href="${escapeHtml(SHOP.tiktokUrl)}" style="color:#8f3d59;text-decoration:underline">${escapeHtml(SHOP.tiktok)}</a></td></tr>
            </table>
            <div style="padding-top:18px;font-size:11px;line-height:18px;color:#9a858e">Email được gửi tự động để bảo vệ tài khoản của bạn.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
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
