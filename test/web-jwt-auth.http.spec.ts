import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import type { Server } from 'node:http';
import * as request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RequestContextMiddleware } from '../src/common/middleware/request-context.middleware';
import { WebAuthController } from '../src/modules/web-auth/api/web-auth.controller';
import {
  WebAuthCookies,
  WebAuthOriginGuard,
  WebJwtAuthGuard,
} from '../src/modules/web-auth/api/web-jwt-auth';
import { WebAuthService } from '../src/modules/web-auth/application/web-auth.service';
import type { Clock } from '../src/common/clock/clock';
import type { AppConfiguration } from '../src/config/configuration';
import type { OtpProvider } from '../src/modules/web-auth/domain/otp-provider';
import type { WebAuthRepository } from '../src/modules/web-auth/domain/web-auth.repository';

const accountId = '00000000-0000-4000-8000-000000000001';

function bodyRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) throw new Error('Expected response body object');
  return body as Record<string, unknown>;
}

describe('Web JWT authentication HTTP boundary', () => {
  let app: INestApplication;
  let server: Server;
  let jwt: JwtService;
  let repository: Pick<WebAuthRepository, 'findAccountById'>;
  let errorLog: jest.SpyInstance;

  beforeAll(async () => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jwt = new JwtService({ secret: 'web-test-signing-key-never-for-deployment' });
    repository = { findAccountById: jest.fn() };
    const auth = new WebAuthService(
      repository as WebAuthRepository,
      {} as OtpProvider,
      {} as Clock,
      new ConfigService<AppConfiguration, true>(),
      jwt,
    );
    const cookies = {
      readAccess: (requestValue: { headers: { cookie?: string } }) =>
        requestValue.headers.cookie
          ?.split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith('kitty_web_access='))
          ?.slice('kitty_web_access='.length),
    } as unknown as WebAuthCookies;
    const moduleRef = await Test.createTestingModule({
      controllers: [WebAuthController],
      providers: [
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: WebAuthService, useValue: auth },
        { provide: WebAuthCookies, useValue: cookies },
        { provide: JwtService, useValue: jwt },
        {
          provide: WebJwtAuthGuard,
          useFactory: (
            jwtService: JwtService,
            webAuth: WebAuthService,
            webCookies: WebAuthCookies,
          ) => new WebJwtAuthGuard(jwtService, webAuth, webCookies),
          inject: [JwtService, WebAuthService, WebAuthCookies],
        },
        { provide: WebAuthOriginGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    const requestContext = new RequestContextMiddleware();
    app.use(requestContext.use.bind(requestContext));
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app?.close();
    errorLog.mockRestore();
  });

  it('maps a valid token plus repository failure to a sanitized 5xx with requestId', async () => {
    const infrastructureError = new Prisma.PrismaClientInitializationError(
      'Cannot reach postgresql://user:secret@db.internal:5432/kitty',
      '6.19.3',
    );
    repository.findAccountById = jest.fn().mockRejectedValueOnce(infrastructureError);
    const accessToken = await jwt.signAsync(
      { sub: accountId, surface: 'web' },
      { algorithm: 'HS256', issuer: 'kitty-api', audience: 'kitty-web', expiresIn: 900 },
    );

    const response = await request(server)
      .get('/api/v1/web/auth/me')
      .set('Cookie', `kitty_web_access=${accessToken}`)
      .set('X-Request-Id', 'web-auth-repository-fault')
      .expect(500);

    const body = bodyRecord(response.body);
    expect(body).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      requestId: 'web-auth-repository-fault',
    });
    expect(body.code).not.toBe('AUTH_REQUIRED');
    expect(JSON.stringify(body)).not.toContain('postgresql://');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(response.headers['x-request-id']).toBe('web-auth-repository-fault');
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http.request.failed',
        requestId: 'web-auth-repository-fault',
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        errorClass: 'PrismaClientInitializationError',
      }),
    );
  });
});
