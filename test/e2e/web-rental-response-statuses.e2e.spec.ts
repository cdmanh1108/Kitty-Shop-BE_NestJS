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

  it('uses the documented success status for quote POSTs', async () => {
    const fixture = await rentalScenario(prisma);
    const quoteRequest = {
      pickupDate: '2026-10-10T10:00:00+07:00',
      returnDate: '2026-10-12T10:00:00+07:00',
      items: [{ productId: fixture.product.id, variantId: fixture.variant.id, quantity: 1 }],
      deliveryMethod: 'self_pickup',
    };

    await request(server).post('/api/v1/web/rental/quote').send(quoteRequest).expect(200);
  });

  it('rejects invalid date-time values before quote calculation', async () => {
    const fixture = await rentalScenario(prisma);

    await request(server)
      .post('/api/v1/web/rental/quote')
      .send({
        pickupDate: '2026-02-30T10:00:00+07:00',
        returnDate: '2026-03-02T10:00:00+07:00',
        items: [{ variantId: fixture.variant.id, quantity: 1 }],
      })
      .expect(400);
  });
});
