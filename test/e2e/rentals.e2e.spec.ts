import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  connectTestDatabase,
  resetTestDatabase,
  disconnectTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';
import { generateTestAccessToken } from '../helpers/auth-helper';
import { rentalScenario } from '../fixtures/rental.fixture';

describe('Rental HTTP command and shop boundaries', () => {
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

  it('creates/replays one rental and rejects tokens carrying a foreign shop claim', async () => {
    const a = await rentalScenario(prisma);
    const tokenA = generateTestAccessToken(a.principal);
    const first = await request(server)
      .post('/api/v1/admin/rental-orders')
      .set('Authorization', 'Bearer ' + tokenA)
      .set('Idempotency-Key', 'http-key')
      .send(a.input)
      .expect(201);
    const replay = await request(server)
      .post('/api/v1/admin/rental-orders')
      .set('Authorization', 'Bearer ' + tokenA)
      .set('Idempotency-Key', 'http-key')
      .send(a.input)
      .expect(201);
    expect(JSON.parse(replay.text) as object).toEqual(JSON.parse(first.text) as object);
    const responseBody: unknown = JSON.parse(first.text);
    expect(responseBody).toMatchObject({
      items: [{ allocations: [{ sku: a.inventory.sku, operationalStatus: 'AVAILABLE' }] }],
    });
    expect(first.text).not.toMatch(
      /"metadata"|"normalizedPhone"|"createdBy"|"pricingSnapshot"|"purchasePrice"/,
    );
    const order = await prisma.rentalOrder.findFirstOrThrow({ where: { shopId: a.shop.id } });
    await request(server)
      .post('/api/v1/admin/rental-orders')
      .set('Authorization', 'Bearer ' + tokenA)
      .send(a.input)
      .expect(409);
    await request(server)
      .get('/api/v1/admin/rental-orders/' + order.id)
      .set(
        'Authorization',
        'Bearer ' +
          generateTestAccessToken({
            ...a.principal,
            shopId: '00000000-0000-4000-8000-000000000000',
          }),
      )
      .expect(401);
    await request(server)
      .patch('/api/v1/admin/rental-orders/' + order.id + '/schedule')
      .set(
        'Authorization',
        'Bearer ' +
          generateTestAccessToken({
            ...a.principal,
            shopId: '00000000-0000-4000-8000-000000000000',
          }),
      )
      .send({ rentalStartAt: '2026-10-15T00:00:00Z', rentalEndAt: '2026-10-17T00:00:00Z' })
      .expect(401);
    await request(server)
      .post('/api/v1/admin/rental-orders')
      .set(
        'Authorization',
        'Bearer ' +
          generateTestAccessToken({
            ...a.principal,
            shopId: '00000000-0000-4000-8000-000000000000',
          }),
      )
      .send({ ...a.input, shopId: a.shop.id })
      .expect(401);
    expect(await prisma.rentalOrder.count()).toBe(1);
  });
});
