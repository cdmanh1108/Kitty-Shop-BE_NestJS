import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import * as request from 'supertest';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { rentalScenario } from '../fixtures/rental.fixture';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';

describe('Web order idempotency HTTP contract', () => {
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

  const command = (variantId: string, phone: string) => ({
    customer: { name: 'HTTP guest', phone },
    pickupDate: '2026-10-10',
    returnDate: '2026-10-12',
    items: [{ variantId, quantity: 1 }],
    delivery: { method: 'self_pickup' },
    paymentMethod: 'cash',
  });

  it('requires a key and replays the completed response with no-store', async () => {
    const fixture = await rentalScenario(prisma);
    const body = command(fixture.variant.id, fixture.customer.phone);

    const missing = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('x-shop-code', fixture.shop.code)
      .send(body)
      .expect(400);
    expect(missing.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(0);

    const first = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('x-shop-code', fixture.shop.code)
      .set('Idempotency-Key', 'http-replay-key')
      .send(body)
      .expect(201);
    const replay = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('x-shop-code', fixture.shop.code)
      .set('Idempotency-Key', 'http-replay-key')
      .send(body)
      .expect(201);

    expect(replay.body).toEqual(first.body);
    expect(first.headers['cache-control']).toContain('no-store');
    expect(replay.headers['cache-control']).toContain('no-store');
    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(1);
  });
});
