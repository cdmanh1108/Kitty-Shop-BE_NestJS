import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import {
  VerificationCodeDeliveryError,
  VERIFICATION_CODE_SENDER,
  type VerificationCodeSender,
} from '../../src/modules/web-auth/domain/verification-code';
import { createTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

// Keep unrelated test requests out of each other's in-memory route throttle buckets.
let testClientSequence = 0;
const nextTestClientIp = (): string => {
  testClientSequence = (testClientSequence % 254) + 1;
  return `198.51.100.${testClientSequence}`;
};

const register = (
  server: Server,
  email = 'user@example.test',
  ip?: string,
  password = 'password dài',
) => {
  const call = request(server)
    .post('/api/v1/web/auth/register')
    .set('Content-Type', 'application/json');
  call.set('X-Forwarded-For', ip ?? nextTestClientIp());
  return call.send({ email, password });
};
const resend = (server: Server, challengeId: string) =>
  request(server)
    .post('/api/v1/web/auth/resend-otp')
    .set('Content-Type', 'application/json')
    .set('X-Forwarded-For', nextTestClientIp())
    .send({ challengeId });
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
  let failNextDelivery = false;
  const sendVerificationCode = jest.fn<
    ReturnType<VerificationCodeSender['send']>,
    Parameters<VerificationCodeSender['send']>
  >();
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    sendVerificationCode.mockImplementation(() => {
      if (failNextDelivery) {
        failNextDelivery = false;
        return Promise.reject(new VerificationCodeDeliveryError('provider_rejected'));
      }
      return Promise.resolve();
    });
    app = await createTestApp((builder) =>
      builder.overrideProvider(VERIFICATION_CODE_SENDER).useValue({ send: sendVerificationCode }),
    );
    server = app.getHttpServer() as Server;
  });
  beforeEach(async () => {
    failNextDelivery = false;
    sendVerificationCode.mockClear();
    await resetTestDatabase(prisma);
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestDatabase();
  });

  it('runs register -> verify -> normalized login -> me -> logout with JWT and refresh cookies', async () => {
    const registration = await register(server, ' User@Example.Test ').expect(201);
    expect(responseValue(registration, 'email')).toBe('user@example.test');
    const pending = await prisma.webAccount.findUniqueOrThrow({
      where: { email: 'user@example.test' },
    });
    expect(pending.emailVerifiedAt).toBeNull();
    expect(await compare('password dài', pending.passwordHash)).toBe(true);
    expect(pending.passwordHash).not.toContain('password dài');
    await request(server)
      .post('/api/v1/web/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'user@example.test', password: 'password dài' })
      .expect(403)
      .expect(expectCode('EMAIL_NOT_VERIFIED'));
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .set('Content-Type', 'application/json')
      .send({ challengeId: responseValue(registration, 'challengeId'), otp: '123456' })
      .expect(200);
    const verified = await prisma.webAccount.findUniqueOrThrow({ where: { id: pending.id } });
    expect(verified.emailVerifiedAt).toBeInstanceOf(Date);
    const agent = request.agent(server);
    const login = await agent
      .post('/api/v1/web/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: ' User@Example.Test ', password: 'password dài' })
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
      .expect((response) => expect(responseValue(response, 'email')).toBe('user@example.test'));
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
      .send({ email: 'user@example.test', password: 'password dài' })
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
    const successfulRefresh = [first, second].find((response) => response.status === 200)!;
    const replacementCookie = setCookieValues(successfulRefresh.headers['set-cookie'])
      .find((value) => value.startsWith('kitty_web_refresh='))!
      .split(';')[0]!;
    const sequentialRefresh = await request(server)
      .post('/api/v1/web/auth/refresh')
      .set('Content-Type', 'application/json')
      .set('Cookie', replacementCookie)
      .send({})
      .expect(200);
    const descendantCookie = setCookieValues(sequentialRefresh.headers['set-cookie'])
      .find((value) => value.startsWith('kitty_web_refresh='))!
      .split(';')[0]!;
    await request(server)
      .post('/api/v1/web/auth/refresh')
      .set('Content-Type', 'application/json')
      .set('Cookie', refreshCookie)
      .send({})
      .expect(401);
    await request(server)
      .post('/api/v1/web/auth/refresh')
      .set('Content-Type', 'application/json')
      .set('Cookie', descendantCookie)
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

  it('revokes the web refresh family when a consumed token is reused', async () => {
    const registration = await register(server).expect(201);
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .set('Content-Type', 'application/json')
      .send({ challengeId: responseValue(registration, 'challengeId'), otp: '123456' })
      .expect(200);
    const login = await request(server)
      .post('/api/v1/web/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'user@example.test', password: 'password dài' })
      .expect(200);
    const refreshCookieA = setCookieValues(login.headers['set-cookie'])
      .find((value) => value.startsWith('kitty_web_refresh='))!
      .split(';')[0]!;
    const firstRefresh = await request(server)
      .post('/api/v1/web/auth/refresh')
      .set('Content-Type', 'application/json')
      .set('Cookie', refreshCookieA)
      .send({})
      .expect(200);
    const refreshCookieB = setCookieValues(firstRefresh.headers['set-cookie'])
      .find((value) => value.startsWith('kitty_web_refresh='))!
      .split(';')[0]!;

    await request(server)
      .post('/api/v1/web/auth/refresh')
      .set('Content-Type', 'application/json')
      .set('Cookie', refreshCookieA)
      .send({})
      .expect(401);
    const compromisedFamily = await prisma.webRefreshTokenFamily.findFirstOrThrow();
    expect(compromisedFamily.revocationReason).toBe('REUSE_DETECTED');
    expect(compromisedFamily.revokedAt).toBeInstanceOf(Date);
    expect(compromisedFamily.reuseDetectedAt).toBeInstanceOf(Date);
    await request(server)
      .post('/api/v1/web/auth/refresh')
      .set('Content-Type', 'application/json')
      .set('Cookie', refreshCookieB)
      .send({})
      .expect(401);
  });

  it('uses a generic login error for unknown email and wrong password', async () => {
    await register(server);
    for (const credentials of [
      { email: 'unknown@example.test', password: 'wrong-pass' },
      { email: 'user@example.test', password: 'wrong-pass' },
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
      .send({ challengeId: responseValue(registration, 'challengeId') })
      .expect(429);
    await prisma.webOtpChallenge.update({
      where: { id: responseValue(registration, 'challengeId') },
      data: {
        expiresAt: new Date(Date.now() - 1000),
        resendAvailableAt: new Date(Date.now() - 1000),
      },
    });
    const originalChallengeId = responseValue(registration, 'challengeId');
    const resent = await resend(server, originalChallengeId).expect(200);
    expect(responseValue(resent, 'challengeId')).not.toBe(originalChallengeId);
    expect(await prisma.webAccount.count()).toBe(1);
    expect(
      (
        await prisma.webOtpChallenge.findUniqueOrThrow({
          where: { id: originalChallengeId },
        })
      ).consumedAt,
    ).toBeInstanceOf(Date);
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

  it('fails registration on provider error and allows one replacement after the short persisted retry delay', async () => {
    failNextDelivery = true;
    const failedResponse = await register(server)
      .expect(503)
      .expect(expectCode('VERIFICATION_DELIVERY_FAILED'));
    expect(bodyRecord(failedResponse.body).message).toBe(
      'Không thể gửi mã xác thực lúc này. Vui lòng thử lại sau.',
    );
    expect(JSON.stringify(failedResponse.body)).not.toContain('Domain not verified');
    expect(JSON.stringify(failedResponse.body)).not.toContain('resend_api_key');

    const account = await prisma.webAccount.findUniqueOrThrow({
      where: { email: 'user@example.test' },
    });
    const failedChallenge = await prisma.webOtpChallenge.findFirstOrThrow({
      where: { accountId: account.id },
    });
    expect(failedChallenge.deliveryStatus).toBe('FAILED');
    expect(failedChallenge.retryAnchorId).toBeNull();
    expect(failedChallenge.resendAvailableAt.getTime()).toBeGreaterThan(Date.now());
    expect(failedChallenge.resendAvailableAt.getTime()).toBeLessThanOrEqual(Date.now() + 10_000);
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .send({ challengeId: failedChallenge.id, otp: '123456' })
      .expect(400)
      .expect(expectCode('OTP_CONSUMED'));
    await register(server, 'user@example.test')
      .expect(429)
      .expect(expectCode('OTP_RESEND_TOO_SOON'));

    await prisma.webOtpChallenge.update({
      where: { id: failedChallenge.id },
      data: { resendAvailableAt: new Date(Date.now() - 1000) },
    });
    const retry = await register(server, 'user@example.test').expect(201);
    const retryId = responseValue(retry, 'challengeId');
    const sentChallenge = await prisma.webOtpChallenge.findUniqueOrThrow({
      where: { id: retryId },
    });
    expect(sentChallenge.deliveryStatus).toBe('SENT');
    expect(
      (await prisma.webOtpChallenge.findUniqueOrThrow({ where: { id: failedChallenge.id } }))
        .consumedAt,
    ).toBeInstanceOf(Date);
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .send({ challengeId: retryId, otp: '123456' })
      .expect(200);
    expect(sendVerificationCode).toHaveBeenCalledTimes(2);
  });

  it('allows resend retry from its consumed source ID after delivery failure without reviving prior codes', async () => {
    const registration = await register(server).expect(201);
    const originalId = responseValue(registration, 'challengeId');
    await prisma.webOtpChallenge.update({
      where: { id: originalId },
      data: { resendAvailableAt: new Date(Date.now() - 1000) },
    });

    failNextDelivery = true;
    await resend(server, originalId).expect(503).expect(expectCode('VERIFICATION_DELIVERY_FAILED'));
    const failedRetry = await prisma.webOtpChallenge.findFirstOrThrow({
      where: { consumedAt: null },
    });
    expect(failedRetry.deliveryStatus).toBe('FAILED');
    expect(failedRetry.retryAnchorId).toBe(originalId);
    await prisma.webOtpChallenge.update({
      where: { id: failedRetry.id },
      data: { resendAvailableAt: new Date(Date.now() - 1000) },
    });

    const retried = await resend(server, originalId).expect(200);
    const currentId = responseValue(retried, 'challengeId');
    const current = await prisma.webOtpChallenge.findUniqueOrThrow({ where: { id: currentId } });
    expect(current.deliveryStatus).toBe('SENT');
    expect(current.id).not.toBe(failedRetry.id);
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .send({ challengeId: originalId, otp: '123456' })
      .expect(400)
      .expect(expectCode('OTP_CONSUMED'));
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .send({ challengeId: failedRetry.id, otp: '123456' })
      .expect(400)
      .expect(expectCode('OTP_CONSUMED'));
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .send({ challengeId: currentId, otp: '123456' })
      .expect(200);
    expect(sendVerificationCode).toHaveBeenCalledTimes(3);
  });

  it('applies the same cooldown to registration retries and invalidates the old OTP', async () => {
    const first = await register(server, ' User@Example.Test ').expect(201);
    const firstChallengeId = responseValue(first, 'challengeId');
    const account = await prisma.webAccount.findUniqueOrThrow({
      where: { email: 'user@example.test' },
    });
    const firstPendingPasswordHash = account.pendingPasswordHash;

    await register(server, 'user@example.test', undefined, 'replacement-password')
      .expect(429)
      .expect(expectCode('OTP_RESEND_TOO_SOON'));
    expect(await prisma.webAccount.count()).toBe(1);
    expect(await prisma.webOtpChallenge.count({ where: { accountId: account.id } })).toBe(1);
    const unchanged = await prisma.webAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(unchanged.pendingPasswordHash).toBe(firstPendingPasswordHash);

    await prisma.webOtpChallenge.update({
      where: { id: firstChallengeId },
      data: { resendAvailableAt: new Date(Date.now() - 1000) },
    });
    const restarted = await register(
      server,
      'user@example.test',
      undefined,
      'replacement-password',
    ).expect(201);
    const nextChallengeId = responseValue(restarted, 'challengeId');
    expect(nextChallengeId).not.toBe(firstChallengeId);
    expect(await prisma.webAccount.count()).toBe(1);
    expect(await prisma.webOtpChallenge.count({ where: { accountId: account.id } })).toBe(2);
    const oldChallenge = await prisma.webOtpChallenge.findUniqueOrThrow({
      where: { id: firstChallengeId },
    });
    expect(oldChallenge.consumedAt).toBeInstanceOf(Date);
    const updatedAccount = await prisma.webAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(updatedAccount.registrationAttemptId).toBe(
      (await prisma.webOtpChallenge.findUniqueOrThrow({ where: { id: nextChallengeId } }))
        .registrationAttemptId,
    );

    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .send({ challengeId: firstChallengeId, otp: '123456' })
      .expect(400)
      .expect(expectCode('OTP_CONSUMED'));
    await request(server)
      .post('/api/v1/web/auth/verify-otp')
      .send({ challengeId: nextChallengeId, otp: '123456' })
      .expect(200);
    await resend(server, nextChallengeId).expect(400).expect(expectCode('EMAIL_ALREADY_VERIFIED'));
  });

  it('rejects unknown and client-identity resend requests', async () => {
    const registration = await register(server).expect(201);
    await resend(server, '00000000-0000-4000-8000-000000000099')
      .expect(400)
      .expect(expectCode('OTP_CHALLENGE_NOT_FOUND'));
    await request(server)
      .post('/api/v1/web/auth/resend-otp')
      .set('Content-Type', 'application/json')
      .send({ challengeId: responseValue(registration, 'challengeId'), email: '+84999999999' })
      .expect(400);
    await request(server)
      .post('/api/v1/web/auth/resend-otp')
      .set('Content-Type', 'application/json')
      .send({ email: 'user@example.test' })
      .expect(400);
  });

  it('serializes concurrent register retry and resend into a single next challenge', async () => {
    const registration = await register(server).expect(201);
    const firstChallengeId = responseValue(registration, 'challengeId');
    const account = await prisma.webAccount.findUniqueOrThrow({
      where: { email: 'user@example.test' },
    });
    await prisma.webOtpChallenge.update({
      where: { id: firstChallengeId },
      data: { resendAvailableAt: new Date(Date.now() - 1000) },
    });

    const [registrationRetry, resendRetry] = await Promise.all([
      register(server),
      resend(server, firstChallengeId),
    ]);
    const responses = [registrationRetry, resendRetry];
    expect(
      responses.filter((response) => response.status === 201 || response.status === 200),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 400 || response.status === 429),
    ).toHaveLength(1);
    expect(await prisma.webAccount.count()).toBe(1);
    expect(await prisma.webOtpChallenge.count({ where: { accountId: account.id } })).toBe(2);
    expect(
      await prisma.webOtpChallenge.count({ where: { accountId: account.id, consumedAt: null } }),
    ).toBe(1);
    expect(
      (await prisma.webOtpChallenge.findUniqueOrThrow({ where: { id: firstChallengeId } }))
        .consumedAt,
    ).toBeInstanceOf(Date);
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
      register(server, 'user@example.test', '203.0.113.88'),
      register(server, 'user@example.test', '203.0.113.88'),
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual([201, 429]);
    expect(bodyRecord(outcomes.find((result) => result.status === 429)?.body).code).toBe(
      'OTP_RESEND_TOO_SOON',
    );
    expect(await prisma.webAccount.count()).toBe(1);
  });
});
