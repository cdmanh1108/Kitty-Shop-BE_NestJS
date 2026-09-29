import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import type { AppConfiguration } from '@config/configuration';
import type {
  VerificationCodeGenerator,
  VerificationCodeSender,
} from '../domain/verification-code';

/** Uses the configured test code in bypass mode and cryptographic randomness otherwise. */
@Injectable()
export class ConfiguredVerificationCodeGenerator implements VerificationCodeGenerator {
  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}

  generate(): string {
    const settings = this.config.get('webAuth', { infer: true });
    return settings.bypassEnabled
      ? settings.bypassCode
      : randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}

/** Test/development adapter: bypass mode is a no-op; delivery otherwise is not configured. */
@Injectable()
export class ConfiguredVerificationCodeSender implements VerificationCodeSender {
  constructor(private readonly config: ConfigService<AppConfiguration, true>) {}

  send(): Promise<void> {
    if (!this.config.get('webAuth', { infer: true }).bypassEnabled) {
      throw new ServiceUnavailableException({
        code: 'VERIFICATION_DELIVERY_UNAVAILABLE',
        message:
          'Verification delivery is not configured. The account remains pending; try again later.',
      });
    }
    return Promise.resolve();
  }
}
