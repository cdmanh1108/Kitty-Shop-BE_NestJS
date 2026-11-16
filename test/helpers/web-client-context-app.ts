import {
  Controller,
  Get,
  Module,
  UnauthorizedException,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { CLOCK } from '../../src/common/clock/clock';
import { ClientThrottlerGuard } from '../../src/common/guards/client-throttler.guard';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { RequestContextMiddleware } from '../../src/common/middleware/request-context.middleware';
import { currentRequestMetadata } from '../../src/common/request-context/request-context';
import { WebClientContextMiddleware } from '../../src/common/web-client-context/web-client-context.middleware';
import { WebAuthController } from '../../src/modules/web-auth/api/web-auth.controller';
import { WebAuthCookies } from '../../src/modules/web-auth/api/web-auth-cookies';
import { WebRegistrationService } from '../../src/modules/web-auth/application/web-registration.service';
import { WebSessionService } from '../../src/modules/web-auth/application/web-session.service';
import { WebProfileService } from '../../src/modules/web-auth/application/web-profile.service';
import { WebJwtAuthGuard } from '../../src/modules/web-auth/public';

export const CLIENT_CONTEXT_TEST_SECRET =
  '819ef47c61bed08dc2365607ab8d34820f859eaaa8edb02b84de12d5e53885b5';
export const CLIENT_CONTEXT_TEST_TIME = 1794823200000;

@Controller('probe')
class OrdinaryController {
  @Get()
  read() {
    return { ok: true };
  }
}

@Module({})
class BoundaryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, WebClientContextMiddleware).forRoutes('*');
  }
}

// Real controller, middleware and global guard; only credential/persistence services are stubbed.
// No AppModule, developer .env, database, email network calls or background jobs.
export async function createWebClientContextTestApp() {
  const observed: Array<{ sessionIp?: string; auditIp?: string }> = [];
  const rejectCredentials = (_input: unknown, metadata: { ipAddress?: string }) => {
    observed.push({ sessionIp: metadata.ipAddress, auditIp: currentRequestMetadata()?.ipAddress });
    throw new UnauthorizedException();
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      {
        module: BoundaryModule,
        imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
        controllers: [WebAuthController, OrdinaryController],
        providers: [
          {
            provide: ConfigService,
            useValue: new ConfigService({
              webClientContext: { required: true, secret: CLIENT_CONTEXT_TEST_SECRET },
              nodeEnv: 'production',
              apiPrefix: 'api/v1',
              appUrl: 'https://backend.example.test',
              corsOrigins: ['https://store.example.test'],
            }),
          },
          { provide: CLOCK, useValue: { now: () => new Date(CLIENT_CONTEXT_TEST_TIME) } },
          { provide: APP_GUARD, useClass: ClientThrottlerGuard },
          {
            provide: WebSessionService,
            useValue: {
              login: rejectCredentials,
              refresh: rejectCredentials,
              logout: () => Promise.resolve(),
            },
          },
          {
            provide: WebRegistrationService,
            useValue: {
              register: () => {
                throw new UnauthorizedException();
              },
              verify: () => {
                throw new UnauthorizedException();
              },
              resend: () => {
                throw new UnauthorizedException();
              },
            },
          },
          { provide: WebProfileService, useValue: {} },
          WebAuthCookies,
        ],
      },
    ],
  })
    .overrideGuard(WebJwtAuthGuard)
    .useValue({
      canActivate: () => {
        throw new UnauthorizedException();
      },
    })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  // Even if a host proxy supplies arbitrary XFF values, signed auth must key by the proof IP.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, observed };
}
