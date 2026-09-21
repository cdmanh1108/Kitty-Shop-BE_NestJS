import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import * as request from 'supertest';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { rentalScenario } from '../fixtures/rental.fixture';
import { createTestProductWithVariant } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';

describe('Web rental input validation HTTP boundary', () => {
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

  const command = (variantId: string) => ({
    customer: { name: 'HTTP guest', phone: '0912345678' },
    pickupDate: '2026-10-10',
    returnDate: '2026-10-12',
    items: [{ variantId, quantity: 1 }],
    delivery: { method: 'self_pickup' },
    paymentMethod: 'cash',
  });

  it('rejects malformed IDs and calendar dates through the real HTTP pipeline', async () => {
    const fixture = await rentalScenario(prisma);

    await request(server)
      .get('/api/v1/web/availability')
      .set('x-shop-code', fixture.shop.code)
      .query({
        variantId: 'not-a-uuid',
        pickupDate: '2026-10-10',
        returnDate: '2026-10-12',
      })
      .expect(400);

    await request(server)
      .post('/api/v1/web/rental/quote')
      .set('x-shop-code', fixture.shop.code)
      .send({
        pickupDate: '2026-02-30',
        returnDate: '2026-03-02',
        items: [{ variantId: fixture.variant.id, quantity: 1 }],
      })
      .expect(400);
  });

  it('rejects malformed nested create payloads before customer, order, or idempotency writes', async () => {
    const fixture = await rentalScenario(prisma);
    const customerCount = await prisma.customer.count({ where: { shopId: fixture.shop.id } });
    const invalid = {
      ...command(fixture.variant.id),
      customer: null,
      delivery: { method: 'shop_delivery', address: '   ' },
    };

    await request(server)
      .post('/api/v1/web/rental-orders')
      .set('x-shop-code', fixture.shop.code)
      .set('Idempotency-Key', 'invalid-web-input')
      .send(invalid)
      .expect(400);

    await expect(prisma.customer.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(
      customerCount,
    );
    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(0);
    await expect(
      prisma.idempotencyRecord.count({ where: { shopId: fixture.shop.id } }),
    ).resolves.toBe(0);
  });

  it('accepts a valid C09 product/variant pair and rejects a mismatched pair without a write', async () => {
    const fixture = await rentalScenario(prisma);
    const other = await createTestProductWithVariant(prisma, fixture.shop.id);

    await request(server)
      .post('/api/v1/web/rental/quote')
      .set('x-shop-code', fixture.shop.code)
      .send({
        pickupDate: '2026-10-10',
        returnDate: '2026-10-12',
        items: [{ productId: fixture.product.id, variantId: fixture.variant.id, quantity: 1 }],
      })
      .expect(200);

    await request(server)
      .post('/api/v1/web/rental-orders')
      .set('x-shop-code', fixture.shop.code)
      .set('Idempotency-Key', 'mismatched-web-selection')
      .send({
        ...command(fixture.variant.id),
        items: [{ productId: other.product.id, variantId: fixture.variant.id, quantity: 1 }],
      })
      .expect(400);

    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(0);
  });
});
