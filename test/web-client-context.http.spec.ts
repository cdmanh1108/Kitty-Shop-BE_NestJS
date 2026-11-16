import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import * as request from 'supertest';
import {
  createWebClientContextTestApp,
  CLIENT_CONTEXT_TEST_SECRET as secret,
  CLIENT_CONTEXT_TEST_TIME as now,
} from './helpers/web-client-context-app';

const header = 'x-kitty-web-client-context';
const path = '/api/v1/web/auth/login';
function proof(ip: string, target = path, method = 'POST', timestamp = now) {
  const mac = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`kitty-web-client.v1\n${timestamp}\n${ip}\n${method}\n${target}`)
    .digest('hex');
  return `v1|${timestamp}|${ip}|${mac}`;
}

describe('Web auth client identity HTTP boundary', () => {
  let app: INestApplication;
  let server: Server;
  let observed: Array<{ sessionIp?: string; auditIp?: string }>;
  beforeAll(async () => {
    ({ app, observed } = await createWebClientContextTestApp());
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => {
    await app?.close();
  });

  function login() {
    return request(server)
      .post(path)
      .set('Origin', 'https://store.example.test')
      .send({ email: 'test@example.test', password: 'InvalidPassword123!' });
  }

  it('gives 11 different clients separate login budgets behind one BFF socket', async () => {
    for (let i = 1; i <= 11; i++) {
      await login()
        .set(header, proof(`192.0.2.${i}`))
        .expect(401);
    }
    expect(observed.at(-1)).toEqual({ sessionIp: '192.0.2.11', auditIp: '192.0.2.11' });
  });

  it('keeps the eleventh request blocked despite fresh proofs and changing spoofed IP headers', async () => {
    for (let i = 0; i < 11; i++) {
      await login()
        .set(header, proof('198.51.100.10', path, 'POST', now + i))
        .set('X-Forwarded-For', `203.0.113.${i + 1}`)
        .set('X-Real-Ip', `203.0.113.${i + 1}`)
        .set('X-Vercel-Forwarded-For', `203.0.113.${i + 1}`)
        .expect(i < 10 ? 401 : 429);
    }
    expect(observed.at(-1)).toEqual({ sessionIp: '198.51.100.10', auditIp: '198.51.100.10' });
  });

  it('rejects unsigned direct auth requests even with every forwarding header present', async () => {
    const response = await login()
      .set('X-Forwarded-For', '203.0.113.100')
      .set('X-Real-IP', '203.0.113.100')
      .set('X-Vercel-Forwarded-For', '203.0.113.100')
      .expect(403);
    expect(response.body).toMatchObject({ code: 'WEB_CLIENT_CONTEXT_INVALID' });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('rejects forged, expired, future, duplicate and wrong-target proofs before reaching credentials', async () => {
    const before = observed.length;
    const valid = proof('198.51.100.20');
    for (const invalid of [
      valid.replace('100.20', '100.21'),
      proof('198.51.100.20', path, 'POST', now - 60_001),
      proof('198.51.100.20', path, 'POST', now + 5_001),
      proof('198.51.100.20', path, 'GET'),
      proof('198.51.100.20', path + '?x=1'),
    ]) {
      const response = await login().set(header, invalid).expect(403);
      expect(response.body).toMatchObject({ code: 'WEB_CLIENT_CONTEXT_INVALID' });
      expect(JSON.stringify(response.body)).not.toContain(invalid);
    }
    await login()
      .set({ [header]: [valid, valid] })
      .expect(403);
    expect(observed).toHaveLength(before);
    await login().set(header, valid).expect(401);
  });

  it('requires proof on every auth handler including path-case and trailing-slash aliases', async () => {
    for (const operation of ['register', 'verify-otp', 'resend-otp', 'refresh', 'logout']) {
      await request(server).post(`/api/v1/web/auth/${operation}`).send({}).expect(403);
    }
    await request(server).get('/api/v1/web/auth/me').expect(403);
    await request(server).patch('/api/v1/web/auth/profile').send({}).expect(403);
    await request(server).post('/api/v1/WEB/AUTH/LOGIN/').send({}).expect(403);
  });

  it('retains the separate 30-request refresh limit', async () => {
    const target = '/api/v1/web/auth/refresh';
    for (let i = 0; i < 31; i++) {
      await request(server)
        .post(target)
        .set(header, proof('198.51.100.30', target))
        .set('Origin', 'https://store.example.test')
        .send({})
        .expect(i < 30 ? 401 : 429);
    }
  });

  it.each([
    ['register', 5],
    ['resend-otp', 5],
    ['verify-otp', 10],
  ] as const)(
    'retains the %s policy independently from the general API limit',
    async (operation, limit) => {
      const target = `/api/v1/web/auth/${operation}`;
      for (let i = 0; i <= limit; i++) {
        await request(server)
          .post(target)
          .set(header, proof('198.51.100.40', target))
          .set('Origin', 'https://store.example.test')
          .send({})
          .expect(i < limit ? 401 : 429);
      }
    },
  );

  it('still checks browser origin after verifying a legitimate assertion', async () => {
    const response = await login()
      .set(header, proof('198.51.100.60'))
      .set('Origin', 'https://untrusted.example.test')
      .expect(403);
    expect(response.body).toMatchObject({ code: 'AUTH_ORIGIN_REJECTED' });
  });

  it('retains ordinary direct APIs and their configured rate limit without requiring a proof', async () => {
    await request(server).get('/api/v1/probe').expect(200);
    await request(server).get('/api/v1/probe').expect(200);
    await request(server).get('/api/v1/probe').expect(429);
  });
});
