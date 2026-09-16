import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import { ClockModule } from '@common/clock/clock.module';
import { WebAuthController } from './api/web-auth.controller';
import { WebAuthService } from './application/web-auth.service';
import { WebAuthCookies, WebJwtAuthGuard, WebAuthOriginGuard } from './api/web-jwt-auth';
import { WEB_AUTH_REPOSITORY } from './domain/web-auth.repository';
import { OTP_PROVIDER } from './domain/otp-provider';
import { PrismaWebAuthRepository } from './infrastructure/prisma-web-auth.repository';
import { ConfiguredOtpProvider } from './infrastructure/configured-otp.provider';

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
    WebAuthOriginGuard,
    { provide: WEB_AUTH_REPOSITORY, useClass: PrismaWebAuthRepository },
    { provide: OTP_PROVIDER, useClass: ConfiguredOtpProvider },
  ],
  exports: [WebAuthService, WebJwtAuthGuard],
})
export class WebAuthModule {}
