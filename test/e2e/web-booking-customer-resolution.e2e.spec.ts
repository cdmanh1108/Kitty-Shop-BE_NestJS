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

describe('Web booking customer resolution HTTP boundary', () => {
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

  const webOrderInput = (variantId: string, phone: string) => ({
    customer: { name: 'Guest supplied recipient', phone, email: 'guest@example.test' },
    pickupDate: '2026-10-10',
    returnDate: '2026-10-12',
    items: [{ variantId, quantity: 1 }],
    delivery: { method: 'self_pickup' },
    paymentMethod: 'cash',
  });

  it('reuses an active customer without leaking or overwriting its profile', async () => {
    const fixture = await rentalScenario(prisma);
    const original = await prisma.customer.update({
      where: { id: fixture.customer.id },
      data: { fullName: 'Existing profile', email: 'existing@example.test' },
    });

    const response = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('x-shop-code', fixture.shop.code)
      .send(webOrderInput(fixture.variant.id, `+84${original.phone.slice(1)}`))
      .expect(201);

    expect(response.body).not.toHaveProperty('customerId');
    const order = await prisma.rentalOrder.findFirstOrThrow({ where: { shopId: fixture.shop.id } });
    expect(order.customerId).toBe(original.id);
    await expect(
      prisma.customer.findUniqueOrThrow({ where: { id: original.id } }),
    ).resolves.toMatchObject({
      fullName: 'Existing profile',
      email: 'existing@example.test',
      status: 'ACTIVE',
    });
  });

  it('returns the controlled policy error for a blocked phone owner without exposing profile data', async () => {
    const fixture = await rentalScenario(prisma);
    const blocked = await prisma.customer.update({
      where: { id: fixture.customer.id },
      data: { status: 'BLOCKED' },
    });

    const response = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('x-shop-code', fixture.shop.code)
      .send(webOrderInput(fixture.variant.id, blocked.phone))
      .expect(409);

    expect(response.body).toMatchObject({
      statusCode: 409,
      code: 'BOOKING_CUSTOMER_UNAVAILABLE',
    });
    expect(JSON.stringify(response.body)).not.toContain(blocked.id);
    expect(JSON.stringify(response.body)).not.toContain('BLOCKED');
    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(0);
  });
});
