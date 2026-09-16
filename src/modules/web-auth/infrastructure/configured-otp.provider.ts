import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import type { OtpProvider } from '../domain/otp-provider';
import { randomInt } from 'node:crypto';

@Injectable()
export class ConfiguredOtpProvider implements OtpProvider {
  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}
  generateCode(): string {
    const settings = this.config.get('webAuth', { infer: true });
    return settings.bypassEnabled
      ? settings.bypassCode
      : randomInt(0, 1000000).toString().padStart(6, '0');
  }
  send(): Promise<void> {
    if (!this.config.get('webAuth', { infer: true }).bypassEnabled) {
      throw new ServiceUnavailableException({
        code: 'OTP_DELIVERY_UNAVAILABLE',
        message: 'Chưa thể gửi mã xác thực. Tài khoản đã được lưu; vui lòng thử gửi lại sau.',
      });
    }
    return Promise.resolve();
  }
}
