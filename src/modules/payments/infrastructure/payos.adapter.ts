import type { AppConfiguration } from '@config/configuration';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundError, PayOS, type PaymentLink, type Webhook } from '@payos/node';
import type {
  CreatePaymentLink,
  PaymentGateway,
  PaymentLink as HostedPaymentLink,
  VerifiedPaymentTransfer,
} from '../domain/payment';

const LINK_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const REFERENCE = /^[a-zA-Z0-9._:/-]{1,100}$/;
const LINK_ORIGIN = 'https://pay.payos.vn';
const FIRST_KITTY_ORDER_CODE = 1_000_000_000_000;

function verifiedTransfer(
  orderCode: number,
  linkId: string,
  reference: string,
  amount: number,
  date: string,
): VerifiedPaymentTransfer {
  if (
    !Number.isSafeInteger(orderCode) ||
    orderCode <= 0 ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    typeof linkId !== 'string' ||
    !LINK_ID.test(linkId) ||
    typeof reference !== 'string' ||
    !REFERENCE.test(reference) ||
    typeof date !== 'string'
  )
    throw new Error('Invalid provider payment details');
  const localTime = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(date);
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(date);
  const timestamp = localTime ? date.replace(' ', 'T') + '+07:00' : hasOffset ? date : '';
  const paidAt = new Date(timestamp);
  if (!Number.isFinite(paidAt.getTime())) throw new Error('Invalid provider payment timestamp');
  return { orderCode, linkId, reference, amount, paidAt };
}

function mapLink(link: PaymentLink): HostedPaymentLink {
  if (
    !Number.isSafeInteger(link.orderCode) ||
    typeof link.id !== 'string' ||
    !LINK_ID.test(link.id) ||
    !Number.isSafeInteger(link.amount) ||
    link.amount <= 0 ||
    !Number.isSafeInteger(link.amountPaid) ||
    link.amountPaid < 0 ||
    !['PENDING', 'CANCELLED', 'UNDERPAID', 'PAID', 'EXPIRED', 'PROCESSING', 'FAILED'].includes(
      link.status,
    ) ||
    !Array.isArray(link.transactions)
  )
    throw new Error('Invalid provider payment link');
  return {
    orderCode: link.orderCode,
    linkId: link.id,
    amount: link.amount,
    status: link.status,
    amountPaid: link.amountPaid,
    transfers: link.transactions.map((item) =>
      verifiedTransfer(
        link.orderCode,
        link.id,
        item.reference,
        item.amount,
        item.transactionDateTime,
      ),
    ),
    // The details endpoint supplies the ID. Hosted links use the same /web/{id} format as create.
    checkoutUrl: LINK_ORIGIN + '/web/' + link.id,
  };
}

@Injectable()
export class PayosAdapter implements PaymentGateway {
  readonly checkout: PaymentGateway['checkout'];
  private readonly sdk?: PayOS;
  private readonly webOrigin?: string;

  constructor(config: ConfigService<AppConfiguration, true>) {
    const settings = config.get('payos', { infer: true });
    this.checkout = {
      enabled: settings.checkoutEnabled,
      configured: !!settings.credentials,
      ttlMinutes: settings.ttlMinutes,
    };
    this.webOrigin = settings.webOrigin;
    if (settings.credentials) {
      this.sdk = new PayOS({
        ...settings.credentials,
        timeout: 4_000,
        maxRetries: 0,
        logLevel: 'off',
      });
    }
  }

  async create(input: CreatePaymentLink): Promise<HostedPaymentLink> {
    const returnUrl = new URL(input.returnPath, this.webOrigin);
    const response = await this.client().paymentRequests.create({
      orderCode: input.orderCode,
      amount: input.amount,
      description: 'KT' + String(input.orderCode).slice(-7),
      returnUrl: returnUrl.href,
      cancelUrl: returnUrl.href,
      expiredAt: Math.floor(input.expiresAt.getTime() / 1_000),
    });
    const url = URL.parse(response.checkoutUrl);
    if (
      !url ||
      url.origin !== LINK_ORIGIN ||
      url.username ||
      url.password ||
      typeof response.paymentLinkId !== 'string' ||
      !LINK_ID.test(response.paymentLinkId) ||
      url.pathname !== '/web/' + response.paymentLinkId ||
      response.currency !== 'VND'
    )
      throw new Error('Invalid provider checkout URL');
    if (response.status !== 'PENDING') {
      const actual = await this.read(input.orderCode);
      if (!actual) throw new Error('Missing provider payment link');
      return actual;
    }
    return {
      orderCode: response.orderCode,
      amount: response.amount,
      linkId: response.paymentLinkId,
      status: response.status,
      amountPaid: 0,
      transfers: [],
      checkoutUrl: url.href,
    };
  }

  async read(orderCode: number): Promise<HostedPaymentLink | null> {
    try {
      return mapLink(await this.client().paymentRequests.get(orderCode));
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  async cancel(orderCode: number): Promise<HostedPaymentLink> {
    return mapLink(await this.client().paymentRequests.cancel(orderCode, 'KITTY dong thanh toan'));
  }

  async verify(payload: unknown): Promise<VerifiedPaymentTransfer | null> {
    const client = this.client();
    try {
      const data = await client.webhooks.verify(payload as Webhook);
      if (data.code !== '00' || data.currency !== 'VND') return null;
      const transfer = verifiedTransfer(
        data.orderCode,
        data.paymentLinkId,
        data.reference,
        data.amount,
        data.transactionDateTime,
      );
      // The signed channel registration probe uses a sample outside our sequence.
      return transfer.orderCode >= FIRST_KITTY_ORDER_CODE ? transfer : null;
    } catch {
      throw new BadRequestException('Thông báo thanh toán payOS không hợp lệ.');
    }
  }

  private client(): PayOS {
    if (!this.sdk) throw new ServiceUnavailableException('Kênh payOS chưa được cấu hình.');
    return this.sdk;
  }
}
