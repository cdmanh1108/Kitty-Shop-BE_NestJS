import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import { ClockModule } from '@common/clock/clock.module';
import { WebAuthController } from './api/web-auth.controller';
import { WebRegistrationService } from './application/web-registration.service';
import { WebSessionService } from './application/web-session.service';
import { OptionalWebJwtAuthGuard, WebJwtAuthGuard, WebAuthOriginGuard } from './public';
import { WebAuthCookies } from './api/web-auth-cookies';
import { WEB_AUTH_REPOSITORY } from './domain/web-auth.repository';
import { VERIFICATION_CODE_GENERATOR, VERIFICATION_CODE_SENDER } from './domain/verification-code';
import { PrismaWebAuthRepository } from './infrastructure/prisma-web-auth.repository';
import { ConfiguredVerificationCodeGenerator } from './infrastructure/configured-verification-code.adapter';
import {
  createResendEmailClient,
  RESEND_EMAIL_CLIENT,
  ResendVerificationCodeSender,
  type ResendEmailClient,
} from './infrastructure/resend-verification-code.sender';

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
    WebRegistrationService,
    WebSessionService,
    WebAuthCookies,
    WebJwtAuthGuard,
    OptionalWebJwtAuthGuard,
    WebAuthOriginGuard,
    { provide: WEB_AUTH_REPOSITORY, useClass: PrismaWebAuthRepository },
    { provide: VERIFICATION_CODE_GENERATOR, useClass: ConfiguredVerificationCodeGenerator },
    {
      provide: RESEND_EMAIL_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfiguration, true>): ResendEmailClient =>
        createResendEmailClient(config.get('email', { infer: true }).resendApiKey),
    },
    {
      provide: VERIFICATION_CODE_SENDER,
      inject: [RESEND_EMAIL_CLIENT, ConfigService],
      useFactory: (
        client: ResendEmailClient,
        config: ConfigService<AppConfiguration, true>,
      ): ResendVerificationCodeSender => new ResendVerificationCodeSender(client, config),
    },
  ],
  exports: [
    WebAuthCookies,
    WebSessionService,
    WebJwtAuthGuard,
    OptionalWebJwtAuthGuard,
    WebAuthOriginGuard,
    JwtModule,
  ],
})
export class WebAuthModule {}
