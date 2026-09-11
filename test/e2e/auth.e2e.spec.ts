import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestShop, createTestUserAndMember, TEST_PASSWORD } from '../fixtures/test-factories';
import { generateTestAccessToken } from '../helpers/auth-helper';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

describe('Auth & Security End-to-End Tests', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    if (app) await app.close();
    await disconnectTestDatabase();
  });

  describe('Public Endpoints', () => {
    it('allows access to liveness probe without authentication', async () => {
      const res = await request(server).get('/api/v1/health/live').expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('Authentication & Authorization Guards (401 / 403 / 200)', () => {
    const parseErrorMessage = (body: unknown): string => {
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const msg = (body as { message: unknown }).message;
        if (typeof msg === 'string') return msg;
        if (Array.isArray(msg)) return msg.join('; ');
      }
      return '';
    };

    it('returns 401 when accessing protected endpoint with no auth token', async () => {
      const res = await request(server).get('/api/v1/customers').expect(401);

      expect(res.body).toHaveProperty('statusCode', 401);
      expect(res.body).toHaveProperty('code', 'HTTP_401');
      expect(parseErrorMessage(res.body)).toContain('Missing bearer access token');
    });

    it('returns 401 when accessing protected endpoint with invalid token format or signature', async () => {
      const res = await request(server)
        .get('/api/v1/customers')
        .set('Authorization', 'Bearer invalid.token.payload')
        .expect(401);

      expect(res.body).toHaveProperty('statusCode', 401);
      expect(res.body).toHaveProperty('code', 'HTTP_401');
      expect(parseErrorMessage(res.body)).toContain('Invalid or expired access token');
    });

    it('returns 403 when user is authenticated but lacks required permission', async () => {
      const shop = await createTestShop(prisma);
      // Create user and member with a role that has NO permissions
      const { user, member } = await createTestUserAndMember(prisma, shop.id, {
        roleCode: 'RESTRICTED_ROLE',
        permissions: [],
      });

      const tokenWithoutPermissions = generateTestAccessToken({
        userId: user.id,
        memberId: member.id,
        shopId: shop.id,
      });

      const res = await request(server)
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${tokenWithoutPermissions}`)
        .expect(403);

      expect(res.body).toHaveProperty('statusCode', 403);
      expect(res.body).toHaveProperty('code', 'HTTP_403');
      expect(parseErrorMessage(res.body)).toContain(
        'You do not have permission to perform this action',
      );
    });

    it('returns 200 when user has valid token and required permission', async () => {
      const shop = await createTestShop(prisma);
      // createTestUserAndMember seeds all permissions by default
      const { user, member } = await createTestUserAndMember(prisma, shop.id);

      const validToken = generateTestAccessToken({
        userId: user.id,
        memberId: member.id,
        shopId: shop.id,
      });

      const res = await request(server)
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('meta');
    });
  });

  describe('DTO Validation (400)', () => {
    const parseErrorMessage = (body: unknown): string => {
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const msg = (body as { message: unknown }).message;
        if (typeof msg === 'string') return msg;
        if (Array.isArray(msg)) return msg.join('; ');
      }
      return '';
    };

    it('returns 400 Bad Request with validation details on invalid login payload', async () => {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email',
          password: '',
        })
        .expect(400);

      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('code', 'HTTP_400');
      expect(parseErrorMessage(res.body)).toContain('email must be an email');
    });
  });

  describe('Complete HTTP Auth Lifecycle & Security Hygiene', () => {
    it('logs in, sanitizes credentials, inspects /me, rotates refresh token, and logs out', async () => {
      const shop = await createTestShop(prisma);
      const { user } = await createTestUserAndMember(prisma, shop.id);
      const email = user.email!;

      // 1. POST /auth/login -> 201 Created
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email,
          password: TEST_PASSWORD,
          shopCode: shop.code,
        })
        .expect(201);

      interface AuthTokenTokens {
        accessToken: string;
        refreshToken: string;
      }
      interface AuthTokensEnvelope {
        tokens: AuthTokenTokens;
      }
      const parseTokens = (body: unknown): AuthTokenTokens => {
        if (
          typeof body === 'object' &&
          body !== null &&
          'tokens' in body &&
          typeof (body as AuthTokensEnvelope).tokens === 'object' &&
          (body as AuthTokensEnvelope).tokens !== null
        ) {
          const tokens = (body as AuthTokensEnvelope).tokens;
          if (typeof tokens.accessToken === 'string' && typeof tokens.refreshToken === 'string') {
            return tokens;
          }
        }
        throw new Error('Response does not contain valid tokens');
      };

      expect(loginRes.body).toHaveProperty('user');
      expect(loginRes.body).toHaveProperty('tokens');

      // Security hygiene: assert response contains NO passwordHash and NO tokenHash
      const responseText = JSON.stringify(loginRes.body);
      expect(responseText).not.toContain('passwordHash');
      expect(responseText).not.toContain('tokenHash');
      expect(responseText).not.toContain('$2b$');

      const tokensA = parseTokens(loginRes.body);
      const accessTokenA = tokensA.accessToken;
      const refreshTokenA = tokensA.refreshToken;

      // 2. GET /auth/me with Bearer token -> 200 OK
      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessTokenA}`)
        .expect(200);

      expect(meRes.body).toHaveProperty('userId', user.id);
      expect(meRes.body).toHaveProperty('email', email);
      expect(meRes.body).toHaveProperty('shopId', shop.id);

      // 3. POST /auth/refresh -> rotates token -> 201 Created
      const refreshRes = await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenA })
        .expect(201);

      const tokensB = parseTokens(refreshRes.body);
      const refreshTokenB = tokensB.refreshToken;
      expect(refreshTokenB).not.toBe(refreshTokenA);

      // 4. Attempting to refresh with old consumed refreshTokenA -> 401 Unauthorized
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenA })
        .expect(401);

      // 5. POST /auth/logout with refreshTokenB and accessToken -> 201 Created
      const newAccessToken = tokensB.accessToken;
      await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .send({ refreshToken: refreshTokenB })
        .expect(201);

      // 6. Attempting to refresh after logout -> 401 Unauthorized
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: refreshTokenB })
        .expect(401);
    });
  });
  it('returns 429 for repeated unauthenticated login attempts through the global throttler', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'absent@example.com', password: TEST_PASSWORD });
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.every((status) => status === 401 || status === 429)).toBe(true);
    await request(server).get('/api/v1/health/live').expect(200);
  });
});
