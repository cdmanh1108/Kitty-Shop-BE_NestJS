import 'reflect-metadata';
import { Controller, Get, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { compare, hash } from 'bcryptjs';
import type { LoginResult } from '../src/modules/auth/application/auth.contracts';
import { HealthController } from '../src/modules/health/api/health.controller';
import { HealthService } from '../src/modules/health/application/health.service';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import * as request from 'supertest';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import { Permissions } from '../src/common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import type { CurrentUser as Principal } from '../src/common/types/current-user';
import type { AppConfiguration } from '../src/config/configuration';
import { validateEnvironment } from '../src/config/env.validation';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { AuthController } from '../src/modules/auth/api/auth.controller';
import { AuthService } from '../src/modules/auth/application/auth.service';
import {
  AUTH_REPOSITORY,
  type AuthIdentity,
  type AuthRepository,
  type CreateRefreshTokenData,
} from '../src/modules/auth/domain/auth.repository';

const secret = 'test-only-auth-secret-not-used-by-any-deployment';
const jwt = new JwtService({ secret });
const ids = {
  sub: '00000000-0000-4000-8000-000000000001',
  mid: '00000000-0000-4000-8000-000000000002',
  sid: '00000000-0000-4000-8000-000000000003',
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const password = 'Test-only-passphrase!';

@Controller('probe')
class ProtectedProbe {
  @Get()
  @Permissions('catalog.manage')
  get(@CurrentUser() user: Principal) {
    return user;
  }
}

describe('Authentication HTTP security (in-memory repository, real guards/JWT/bcrypt)', () => {
  let app: INestApplication;
  let server: Server;
  let service: AuthService;
  let identity: AuthIdentity;
  let repository: jest.Mocked<AuthRepository>;
  let rows: Map<string, CreateRefreshTokenData & { revoked: boolean }>;
  let passwordHash: string;
  const membership = jest.fn();

  beforeAll(async () => {
    passwordHash = await hash(password, 12);
  });
  beforeEach(async () => {
    rows = new Map();
    identity = {
      userId: ids.sub,
      memberId: ids.mid,
      shopId: ids.sid,
      email: 'admin@example.com',
      fullName: 'Admin',
      passwordHash,
      userStatus: 'ACTIVE',
      memberStatus: 'ACTIVE',
      permissions: [],
    };
    repository = {
      findIdentityByEmail: jest.fn().mockImplementation(() => Promise.resolve(identity)),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
      createRefreshToken: jest.fn().mockImplementation((data: CreateRefreshTokenData) => {
        rows.set(data.tokenHash, { ...data, revoked: false });
        return Promise.resolve();
      }),
      rotateRefreshToken: jest
        .fn()
        .mockImplementation(
          (tokenHash: string, replacement: Omit<CreateRefreshTokenData, 'userId' | 'memberId'>) => {
            const current = rows.get(tokenHash);
            if (
              !current ||
              current.revoked ||
              current.expiresAt.getTime() <= Date.now() ||
              identity.userStatus !== 'ACTIVE' ||
              identity.memberStatus !== 'ACTIVE'
            )
              return Promise.resolve(null);
            current.revoked = true;
            rows.set(replacement.tokenHash, {
              ...replacement,
              userId: current.userId,
              memberId: current.memberId,
              revoked: false,
            });
            return Promise.resolve(identity);
          },
        ),
      revokeRefreshToken: jest
        .fn()
        .mockImplementation((tokenHash: string, userId: string, memberId: string) => {
          const row = rows.get(tokenHash);
          if (row?.userId === userId && row.memberId === memberId) row.revoked = true;
          return Promise.resolve();
        }),
      findPasswordHash: jest.fn().mockResolvedValue(passwordHash),
      updatePasswordAndRevokeSessions: jest.fn().mockResolvedValue(undefined),
    };
    membership.mockReset().mockImplementation(() =>
      Promise.resolve({
        id: identity.memberId,
        shopId: identity.shopId,
        userId: identity.userId,
        status: identity.memberStatus,
        user: {
          status: identity.userStatus,
          email: identity.email,
          fullName: identity.fullName,
          passwordHash,
        },
        memberRoles: identity.permissions.map((code) => ({
          role: { rolePermissions: [{ permission: { code } }] },
        })),
      }),
    );
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [AuthController, HealthController, ProtectedProbe],
      providers: [
        {
          provide: HealthService,
          useValue: {
            live: () => ({ status: 'ok' }),
            ready: () => Promise.resolve({ status: 'ok', database: 'up' }),
          },
        },
        AuthService,
        { provide: AUTH_REPOSITORY, useValue: repository },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: new ConfigService<AppConfiguration, true>({
            jwtAccessTtlSeconds: 900,
            refreshTokenTtlDays: 30,
          }),
        },
        { provide: PrismaService, useValue: { shopMember: { findUnique: membership } } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    server = app.getHttpServer() as Server;
    service = app.get(AuthService);
  });
  afterEach(async () => {
    await app.close();
  });
  const credentials = { email: 'admin@example.com', password };
  const bearer = () => jwt.sign(ids, { expiresIn: 900, algorithm: 'HS256' });

  it('logs in without exposing persisted hashes; uses HS256, 900s and a 384-bit opaque refresh token', async () => {
    const response = await request(server)
      .post('/auth/login')
      .send(credentials)
      .expect(201)
      .expect('Cache-Control', 'no-store');
    expect(response.text).not.toContain(passwordHash);
    expect(response.text).not.toContain('tokenHash');
    const session = await service.login(credentials, {});
    expect(session.tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(rows.has(digest(session.tokens.refreshToken))).toBe(true);
    expect(JSON.stringify([...rows.values()])).not.toContain(session.tokens.refreshToken);
    expect(jwt.decode(session.tokens.accessToken)).toEqual({
      ...ids,
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    });
    expect(session.tokens.expiresIn).toBe(900);
  });

  it.each(['missing', 'wrong', 'inactive-user', 'inactive-member'] as const)(
    'uses the same 401 credential response for %s',
    async (reason) => {
      if (reason === 'missing') repository.findIdentityByEmail.mockResolvedValue(null);
      if (reason === 'inactive-user') identity.userStatus = 'INACTIVE';
      if (reason === 'inactive-member') identity.memberStatus = 'INACTIVE';
      const response = await request(server)
        .post('/auth/login')
        .send({ ...credentials, password: reason === 'wrong' ? 'Wrong-password!' : password })
        .expect(401);
      expect(response.text).toContain('Email hoặc mật khẩu không chính xác.');
      expect(repository.createRefreshToken.mock.calls).toHaveLength(0);
    },
  );

  it('limits login to 10 requests/IP/minute, ignoring spoofed forwarded headers; normal APIs retain their bucket', async () => {
    repository.findIdentityByEmail.mockResolvedValue(null);
    for (let i = 0; i < 10; i++)
      await request(server)
        .post('/auth/login')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .send(credentials)
        .expect(401);
    await request(server).post('/auth/login').send(credentials).expect(429);
    await request(server).get('/auth/me').set('Authorization', `Bearer ${bearer()}`).expect(200);
  });

  it('limits refresh independently to 60 requests/IP/minute', async () => {
    for (let i = 0; i < 60; i++)
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: 'x'.repeat(64) })
        .expect(401);
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: 'x'.repeat(64) })
      .expect(429);
    await request(server).post('/auth/login').send(credentials).expect(201);
  });

  it('only allows one concurrent refresh and leaves its replacement usable after old-token reuse', async () => {
    const session = await service.login(credentials, {});
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(server).post('/auth/refresh').send({ refreshToken: session.tokens.refreshToken }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 401]);
    expect(rows.size).toBe(2);
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: session.tokens.refreshToken })
      .expect(401);
    expect([...rows.values()].filter((row) => !row.revoked)).toHaveLength(1);
    const winner = responses.find((response) => response.status === 201);
    if (!winner) throw new Error('Missing successful rotation');
    const rotated = JSON.parse(winner.text) as LoginResult;
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: rotated.tokens.refreshToken })
      .expect(201)
      .expect('Cache-Control', 'no-store');
  });

  it.each(['expired', 'revoked', 'inactive'] as const)(
    'rejects %s refresh credentials',
    async (state) => {
      const session = await service.login(credentials, {});
      const row = rows.get(digest(session.tokens.refreshToken));
      if (!row) throw new Error('Missing fixture');
      if (state === 'expired') row.expiresAt = new Date(0);
      if (state === 'revoked') row.revoked = true;
      if (state === 'inactive') identity.memberStatus = 'INACTIVE';
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: session.tokens.refreshToken })
        .expect(401);
      expect(rows.size).toBe(1);
    },
  );

  it('logout revokes only the presented token belonging to the principal; access JWT still works', async () => {
    const session = await service.login(credentials, {});
    const other = await service.login(credentials, {});
    const row = rows.get(digest(other.tokens.refreshToken));
    if (!row) throw new Error('Missing fixture');
    row.memberId = 'another-member';
    await request(server)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${session.tokens.accessToken}`)
      .send({ refreshToken: other.tokens.refreshToken })
      .expect(201);
    expect(row.revoked).toBe(false);
    await request(server)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${session.tokens.accessToken}`)
      .send({ refreshToken: session.tokens.refreshToken })
      .expect(201);
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: session.tokens.refreshToken })
      .expect(401);
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${session.tokens.accessToken}`)
      .expect(200);
  });

  it('distinguishes 401 authentication and 403 permission failures and reloads permissions', async () => {
    await request(server).get('/probe').expect(401);
    await request(server).get('/probe').set('Authorization', `Bearer ${bearer()}`).expect(403);
    identity.permissions = ['catalog.manage'];
    await request(server).get('/probe').set('Authorization', `Bearer ${bearer()}`).expect(200);
  });

  it('uses verified membership tenant; rejects spoofed body fields and mismatched signed tenant', async () => {
    const response = await request(server)
      .get('/auth/me?shopId=other')
      .set('X-Shop-Id', 'other')
      .set('Authorization', `Bearer ${bearer()}`)
      .expect(200);
    expect(response.text).toContain(ids.sid);
    expect(response.text).not.toContain(passwordHash);
    await request(server)
      .post('/auth/login')
      .send({ ...credentials, shopId: 'other', permissions: ['members.manage'] })
      .expect(400);
    const token = jwt.sign(
      { ...ids, sid: '00000000-0000-4000-8000-000000000004' },
      { expiresIn: 900 },
    );
    await request(server).get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('keeps health public and logout/change-password protected', async () => {
    await request(server).get('/health/live').expect(200);
    await request(server).get('/health/ready').expect(200);
    await request(server)
      .post('/auth/logout')
      .send({ refreshToken: 'x'.repeat(64) })
      .expect(401);
    await request(server)
      .post('/auth/change-password')
      .send({ currentPassword: password, newPassword: 'Replacement-password!' })
      .expect(401);
  });

  it('hashes password changes at cost 12 and asks persistence to revoke user refresh tokens', async () => {
    await request(server)
      .post('/auth/change-password')
      .set('Authorization', 'Bearer ' + bearer())
      .send({ currentPassword: password, newPassword: 'Replacement-password!' })
      .expect(201);
    const update = repository.updatePasswordAndRevokeSessions.mock.calls[0];
    if (!update) throw new Error('Missing password update');
    expect(update[0]).toBe(ids.sub);
    expect(update[1]).toMatch(/^\$2[aby]\$12\$/);
    expect(await compare('Replacement-password!', update[1])).toBe(true);
  });

  it('does not accept access tokens as refresh, or opaque refresh tokens as bearer JWTs', async () => {
    const session = await service.login(credentials, {});
    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: session.tokens.accessToken })
      .expect(401);
    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${session.tokens.refreshToken}`)
      .expect(401);
  });

  it.each(['HS384', 'missing-exp', 'malformed-id', 'expired', 'wrong-secret'] as const)(
    'rejects %s JWTs before database lookup',
    async (variant) => {
      const token =
        variant === 'missing-exp'
          ? jwt.sign(ids)
          : variant === 'malformed-id'
            ? jwt.sign({ ...ids, mid: { invalid: true } }, { expiresIn: 900 })
            : jwt.sign(ids, {
                expiresIn: variant === 'expired' ? -1 : 900,
                algorithm: variant === 'HS384' ? 'HS384' : 'HS256',
                ...(variant === 'wrong-secret' ? { secret: 'other-secret' } : {}),
              });
      await request(server).get('/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
      expect(membership.mock.calls).toHaveLength(0);
    },
  );
});

describe('authentication TTL configuration', () => {
  const config = { DATABASE_URL: 'postgresql://unused', JWT_ACCESS_SECRET: secret };
  it.each(['0', '-1', 'NaN', '', '0.5', 'Infinity', '9007199254740992'])(
    'rejects invalid lifetime %s',
    (value) => {
      for (const key of ['JWT_ACCESS_TTL_SECONDS', 'REFRESH_TOKEN_TTL_DAYS'])
        expect(() => validateEnvironment({ ...config, [key]: value })).toThrow(key);
    },
  );
  it('accepts omitted defaults and positive integer overrides', () => {
    expect(() => validateEnvironment(config)).not.toThrow();
    expect(() =>
      validateEnvironment({
        ...config,
        JWT_ACCESS_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_DAYS: '30',
      }),
    ).not.toThrow();
  });
});
