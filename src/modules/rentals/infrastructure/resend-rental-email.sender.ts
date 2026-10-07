import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import {
  RentalEmailDeliveryError,
  type RentalEmailMessage,
  type RentalEmailSender,
} from '../domain/rental-email';

@Injectable()
export class ResendRentalEmailSender implements RentalEmailSender {
  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}

  async send(message: RentalEmailMessage, idempotencyKey: string): Promise<string> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${this.config.get('email', { infer: true }).resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(message),
      });
      if (!response.ok) {
        const errorBody: unknown = await response.json().catch(() => null);
        const concurrentRequest =
          errorBody !== null &&
          typeof errorBody === 'object' &&
          'name' in errorBody &&
          errorBody.name === 'concurrent_idempotent_requests';
        const retryable =
          response.status === 429 ||
          response.status === 408 ||
          response.status >= 500 ||
          (response.status === 409 && concurrentRequest);
        throw new RentalEmailDeliveryError(
          `Nhà cung cấp từ chối gửi (HTTP ${response.status}).`,
          retryable,
        );
      }
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== 'object' ||
        !('id' in data) ||
        typeof data.id !== 'string' ||
        !data.id
      )
        throw new RentalEmailDeliveryError('Chưa xác định được kết quả gửi từ nhà cung cấp.', true);
      return data.id;
    } catch (error) {
      if (error instanceof RentalEmailDeliveryError) throw error;
      // Provider/network errors may contain addresses or credentials; never persist their raw text.
      throw new RentalEmailDeliveryError(
        'Chưa xác định được kết quả gửi do lỗi kết nối hoặc hết thời gian chờ.',
        true,
      );
    }
  }
}
