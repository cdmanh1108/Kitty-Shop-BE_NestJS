import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import type { AppConfiguration } from '@config/configuration';
import type { VerificationCodeGenerator } from '../domain/verification-code';

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
