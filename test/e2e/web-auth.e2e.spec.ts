import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { createTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

const register = (server: Server, phone = '0912345678', ip?: string) => {
  const call = request(server)
    .post('/api/v1/web/auth/register')
    .set('Content-Type', 'application/json');
  if (ip) call.set('X-Forwarded-For', ip);
  return call.send({ phone, password: 'password dài' });
};
const bodyRecord = (body: unknown): Record<string, unknown> => {
  if (typeof body !== 'object' || body === null) throw new Error('Expected response object');
  return body as Record<string, unknown>;
};
const responseValue = (response: { body: unknown }, key: string): string => {
  const value = bodyRecord(response.body)[key];
  if (typeof value !== 'string') throw new Error(`Expected response ${key}`);
  return value;
};
const setCookieValues = (value: string | string[] | undefined): string[] =>
  Array.isArray(value) ? value : value ? [value] : [];
const expectCode =
  (code: string) =>
  (response: { body: unknown }): void => {
    expect(bodyRecord(response.body).code).toBe(code);
  };

describe('Web authentication end-to-end', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });
  beforeEach(async () => resetTestDatabase(prisma));
  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('runs register -> verify -> normalized login -> me -> logout with JWT and refresh cookies', async () => {
    const registration = await register(server).expect(201);
    const pending = await prisma.webAccount.findUniqueOrThrow({ where: { phone: '+84912345678' } });
    expect(pending.phoneVerifiedAt).toBeNull();
    expect(await compare('password dài', pending.passwordHash)).toBe(true);
    expect(pending.passwordHash).not.toContain('password dài');
    await request(server)
      .post('/api/v1/web/auth/login')
      .set('Content-Type', 'application/json')
      .send({ phone: '+84912345678', password: 'password dài' })
      .expect(403)
      .expect(expectCode('PHONE_NOT_VERIFIED'));
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .set('Content-Type', 'application/json')
      .send({ challengeId: responseValue(registration, 'challengeId'), otp: '123456' })
      .expect(200);
    const agent = request.agent(server);
    const login = await agent
      .post('/api/v1/web/auth/login')
      .set('Content-Type', 'application/json')
      .send({ phone: '84 912 345 678', password: 'password dài' })
      .expect(200);
    const loginCookies = setCookieValues(login.headers['set-cookie']);
    expect(loginCookies).toHaveLength(2);
    expect(loginCookies.find((value) => value.startsWith('kitty_web_access='))).toMatch(
      /Path=\/api;.*HttpOnly; SameSite=Lax/i,
    );
    expect(loginCookies.find((value) => value.startsWith('kitty_web_refresh='))).toMatch(
      /Path=\/api\/v1\/web\/auth;.*HttpOnly; SameSite=Lax/i,
    );
    expect(JSON.stringify(login.body)).not.toMatch(/accessToken|refreshToken|passwordHash/);
    const persisted = await prisma.webRefreshToken.findFirstOrThrow();
    const rawRefresh = loginCookies
      .find((value) => value.startsWith('kitty_web_refresh='))!
      .split(';')[0]!
      .split('=')[1]!;
    expect(persisted.tokenHash).not.toBe(rawRefresh);
    await agent
      .get('/api/v1/web/auth/me')
      .expect(200)
      .expect((response) => expect(responseValue(response, 'phone')).toBe('+84912345678'));
    await agent
      .post('/api/v1/web/auth/logout')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(200);
    expect(await prisma.webRefreshToken.count({ where: { revokedAt: null } })).toBe(0);
    await agent.get('/api/v1/web/auth/me').expect(401);
  });

  it('rotates refresh atomically and separates Admin/Web token surfaces', async () => {
    const registration = await register(server).expect(201);
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .set('Content-Type', 'application/json')
      .send({ challengeId: responseValue(registration, 'challengeId'), otp: '123456' })
      .expect(200);
    const login = await request(server)
      .post('/api/v1/web/auth/login')
      .set('Content-Type', 'application/json')
      .send({ phone: '0912345678', password: 'password dài' })
      .expect(200);
    const cookies = setCookieValues(login.headers['set-cookie']);
    const accessCookie = cookies
      .find((value) => value.startsWith('kitty_web_access='))!
      .split(';')[0]!;
    const refreshCookie = cookies
      .find((value) => value.startsWith('kitty_web_refresh='))!
      .split(';')[0]!;
    const [first, second] = await Promise.all([
      request(server)
        .post('/api/v1/web/auth/refresh')
        .set('Content-Type', 'application/json')
        .set('Cookie', refreshCookie)
        .send({}),
      request(server)
        .post('/api/v1/web/auth/refresh')
        .set('Content-Type', 'application/json')
        .set('Cookie', refreshCookie)
        .send({}),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 401]);
    await request(server)
      .post('/api/v1/web/auth/refresh')
      .set('Content-Type', 'application/json')
      .set('Cookie', refreshCookie)
      .send({})
      .expect(401);
    const accessJwt = accessCookie.slice('kitty_web_access='.length);
    await request(server)
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${accessJwt}`)
      .expect(401);
    const adminJwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET }).sign(
      {
        sub: crypto.randomUUID(),
        mid: crypto.randomUUID(),
        sid: crypto.randomUUID(),
        surface: 'admin',
      },
      { algorithm: 'HS256', issuer: 'kitty-api', audience: 'kitty-admin', expiresIn: 900 },
    );
    await request(server)
      .get('/api/v1/web/auth/me')
      .set('Cookie', `kitty_web_access=${adminJwt}`)
      .expect(401);
    await request(server).get('/api/v1/web/auth/me').set('Cookie', accessCookie).expect(200);
  });

  it('uses a generic login error for unknown phone and wrong password', async () => {
    await register(server);
    for (const credentials of [
      { phone: '0987654321', password: 'wrong-pass' },
      { phone: '0912345678', password: 'wrong-pass' },
    ]) {
      await request(server)
        .post('/api/v1/web/auth/login')
        .set('Content-Type', 'application/json')
        .send(credentials)
        .expect(401)
        .expect(expectCode('INVALID_CREDENTIALS'));
    }
  });

  it('limits OTP attempts, rejects reuse and enforces resend cooldown without duplicate users', async () => {
    const registration = await register(server).expect(201);
    const verifyOtp = () =>
      request(server)
        .post('/api/v1/web/auth/verify-otp')
        .set('X-Forwarded-For', '203.0.113.56')
        .set('Content-Type', 'application/json');
    for (let index = 0; index < 5; index += 1)
      await verifyOtp()
        .send({ challengeId: responseValue(registration, 'challengeId'), otp: '000000' })
        .expect(400);
    await verifyOtp()
      .send({ challengeId: responseValue(registration, 'challengeId'), otp: '123456' })
      .expect(400)
      .expect(expectCode('OTP_ATTEMPTS_EXCEEDED'));
    await request(server)
      .post('/api/v1/web/auth/resend-otp')
      .set('Content-Type', 'application/json')
      .send({ phone: '0912345678' })
      .expect(429);
    await prisma.webOtpChallenge.update({
      where: { id: responseValue(registration, 'challengeId') },
      data: { resendAvailableAt: new Date(Date.now() - 1000) },
    });
    const resent = await request(server)
      .post('/api/v1/web/auth/resend-otp')
      .set('Content-Type', 'application/json')
      .send({ phone: '+84912345678' })
      .expect(200);
    expect(await prisma.webAccount.count()).toBe(1);
    await verifyOtp()
      .send({ challengeId: responseValue(registration, 'challengeId'), otp: '123456' })
      .expect(400)
      .expect(expectCode('OTP_CONSUMED'));
    await verifyOtp()
      .send({ challengeId: responseValue(resent, 'challengeId'), otp: '123456' })
      .expect(200);
    await verifyOtp()
      .send({ challengeId: responseValue(resent, 'challengeId'), otp: '123456' })
      .expect(400)
      .expect(expectCode('OTP_CONSUMED'));
  });

  it('rejects expired OTP and concurrent duplicate registration creates one account', async () => {
    const registration = await register(server).expect(201);
    await prisma.webOtpChallenge.update({
      where: { id: responseValue(registration, 'challengeId') },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .set('X-Forwarded-For', '203.0.113.57')
      .set('Content-Type', 'application/json')
      .send({ challengeId: responseValue(registration, 'challengeId'), otp: '123456' })
      .expect(400)
      .expect(expectCode('OTP_EXPIRED'));
    await resetTestDatabase(prisma);
    const outcomes = await Promise.all([
      register(server, '0912345678', '203.0.113.88'),
      register(server, '0912345678', '203.0.113.88'),
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(bodyRecord(outcomes.find((result) => result.status === 409)?.body).code).toBe(
      'PHONE_NOT_VERIFIED',
    );
    expect(await prisma.webAccount.count()).toBe(1);
  });
});
