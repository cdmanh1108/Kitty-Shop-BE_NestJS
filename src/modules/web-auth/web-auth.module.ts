import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import { ClockModule } from '@common/clock/clock.module';
import { WebAuthController } from './api/web-auth.controller';
import { WebAuthService } from './application/web-auth.service';
import {
  OptionalWebJwtAuthGuard,
  WebAuthCookies,
  WebJwtAuthGuard,
  WebAuthOriginGuard,
} from './api/web-jwt-auth';
import { WEB_AUTH_REPOSITORY } from './domain/web-auth.repository';
import { VERIFICATION_CODE_GENERATOR, VERIFICATION_CODE_SENDER } from './domain/verification-code';
import { PrismaWebAuthRepository } from './infrastructure/prisma-web-auth.repository';
import {
  ConfiguredVerificationCodeGenerator,
  ConfiguredVerificationCodeSender,
} from './infrastructure/configured-verification-code.adapter';

@Module({
  imports: [
    ClockModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfiguration, true>) => ({
        secret: config.get('webAuth', { infer: true }).accessSecret,
      }),
    }),
  ],
  controllers: [WebAuthController],
  providers: [
    WebAuthService,
    WebAuthCookies,
    WebJwtAuthGuard,
    OptionalWebJwtAuthGuard,
    WebAuthOriginGuard,
    { provide: WEB_AUTH_REPOSITORY, useClass: PrismaWebAuthRepository },
    { provide: VERIFICATION_CODE_GENERATOR, useClass: ConfiguredVerificationCodeGenerator },
    { provide: VERIFICATION_CODE_SENDER, useClass: ConfiguredVerificationCodeSender },
  ],
  exports: [
    WebAuthService,
    WebAuthCookies,
    WebJwtAuthGuard,
    OptionalWebJwtAuthGuard,
    WebAuthOriginGuard,
    JwtModule,
  ],
})
export class WebAuthModule {}
