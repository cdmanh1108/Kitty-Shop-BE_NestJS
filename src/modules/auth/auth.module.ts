import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfiguration } from '@config/configuration';
import { AuthController } from './api/auth.controller';
import { AuthService } from './application/auth.service';
import { AUTH_REPOSITORY } from './domain/auth.repository';
import { PrismaAuthRepository } from './infrastructure/prisma-auth.repository';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfiguration, true>) => ({
        secret: config.get('jwtAccessSecret', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PrismaAuthRepository,
    { provide: AUTH_REPOSITORY, useExisting: PrismaAuthRepository },
  ],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
