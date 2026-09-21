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

function orderCodeFrom(body: unknown): string {
  if (
    !body ||
    typeof body !== 'object' ||
    !('orderCode' in body) ||
    typeof body.orderCode !== 'string'
  )
    throw new Error('Expected a Web create-order response with an orderCode');
  return body.orderCode;
}

describe('Web rental response statuses', () => {
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

  it('uses documented statuses for query-like Web POSTs while create remains 201', async () => {
    const fixture = await rentalScenario(prisma);
    const quoteRequest = {
      pickupDate: '2026-10-10',
      returnDate: '2026-10-12',
      items: [{ productId: fixture.product.id, variantId: fixture.variant.id, quantity: 1 }],
      deliveryMethod: 'self_pickup',
    };

    await request(server)
      .post('/api/v1/web/rental/quote')
      .set('x-shop-code', fixture.shop.code)
      .send(quoteRequest)
      .expect(200);

    const create = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('x-shop-code', fixture.shop.code)
      .set('Idempotency-Key', 'web-status-matrix-create')
      .send({
        customer: { name: 'Status guest', phone: fixture.customer.phone },
        pickupDate: quoteRequest.pickupDate,
        returnDate: quoteRequest.returnDate,
        items: quoteRequest.items,
        delivery: { method: 'self_pickup' },
        paymentMethod: 'cash',
      })
      .expect(201);
    const orderCode = orderCodeFrom(JSON.parse(create.text) as unknown);

    await request(server)
      .post('/api/v1/web/rental-orders/lookup')
      .set('x-shop-code', fixture.shop.code)
      .send({ orderCode, phone: fixture.customer.phone })
      .expect(200);
  });

  it('keeps validation and private lookup errors out of the 200 success path', async () => {
    const fixture = await rentalScenario(prisma);
    const order = await prisma.rentalOrder.create({
      data: {
        shopId: fixture.shop.id,
        customerId: fixture.customer.id,
        orderNumber: 'WEB_STATUS_PRIVATE',
        rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
        rentalEndAt: new Date('2026-10-12T00:00:00.000Z'),
        grandTotal: 100000,
      },
    });

    await request(server)
      .post('/api/v1/web/rental/quote')
      .set('x-shop-code', fixture.shop.code)
      .send({
        pickupDate: '2026-02-30',
        returnDate: '2026-03-02',
        items: [{ variantId: fixture.variant.id, quantity: 1 }],
      })
      .expect(400);

    await request(server)
      .post('/api/v1/web/rental-orders/lookup')
      .set('x-shop-code', fixture.shop.code)
      .send({ orderCode: order.orderNumber, phone: '0999999999' })
      .expect(404);
  });
});
