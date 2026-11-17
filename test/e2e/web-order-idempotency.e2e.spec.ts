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
import { createVerifiedWebAccount, webAccessCookie } from '../helpers/web-session';

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
    pickupDate: '2026-10-10T08:30:00+07:00',
    returnDate: '2026-10-12T08:30:00+07:00',
    items: [{ variantId, quantity: 1 }],
    delivery: { method: 'self_pickup' },
    paymentMethod: 'cash',
  });

  it('quotes and books two free accessories per paid unit with distinct stock and safe replay', async () => {
    const f = await rentalScenario(prisma);
    await prisma.product.update({
      where: { id: f.product.id },
      data: { allowFreeAccessory: true, freeAccessoryLimit: 2 },
    });
    await prisma.inventoryItem.createMany({
      data: [1, 2].map((index) => ({
        shopId: f.shop.id,
        variantId: f.variant.id,
        sku: `${f.variant.variantCode}-FREE-${index}`,
        currentStatus: 'AVAILABLE',
      })),
    });
    const account = await createVerifiedWebAccount(prisma);
    const cookie = webAccessCookie(account.id);
    const base = command(f.variant.id, f.customer.phone);
    const body = {
      ...base,
      items: [
        ...base.items,
        { variantId: f.variant.id, quantity: 2, billingRole: 'FREE_ACCESSORY' },
      ],
    };
    const quote = await request(server)
      .post('/api/v1/web/rental/quote')
      .send({
        pickupDate: body.pickupDate,
        returnDate: body.returnDate,
        items: body.items,
        deliveryMethod: 'self_pickup',
      })
      .expect(200);
    expect(quote.body).toMatchObject({
      rentalSubtotal: 60000,
      depositAmount: 200000,
      accessoryAllowance: {
        billableQuantity: 1,
        freeAccessoryQuantity: 2,
        remainingFreeAccessoryQuantity: 0,
      },
    });
    const excessive = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'too-many-free-accessories')
      .send({
        ...body,
        items: [
          ...base.items,
          { variantId: f.variant.id, quantity: 3, billingRole: 'FREE_ACCESSORY' },
        ],
      })
      .expect(400);
    expect(excessive.body).toMatchObject({ code: 'FREE_ACCESSORY_ALLOWANCE_EXCEEDED' });
    expect(await prisma.rentalOrder.count()).toBe(0);
    const first = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'two-free-accessories')
      .send(body)
      .expect(201);
    const replay = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'two-free-accessories')
      .send(body)
      .expect(201);
    expect(replay.body).toEqual(first.body);
    const allocations = await prisma.rentalItemAllocation.findMany({
      where: { shopId: f.shop.id },
    });
    expect(allocations).toHaveLength(3);
    expect(new Set(allocations.map((item) => item.inventoryItemId)).size).toBe(3);
  });

  it('requires a key and replays the completed response with no-store', async () => {
    const fixture = await rentalScenario(prisma);
    const account = await createVerifiedWebAccount(prisma);
    const cookie = webAccessCookie(account.id);
    const body = command(fixture.variant.id, fixture.customer.phone);

    const missing = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', cookie)
      .send(body)
      .expect(400);
    expect(missing.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(0);

    const first = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'http-replay-key')
      .send(body)
      .expect(201);
    const replay = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'http-replay-key')
      .send(body)
      .expect(201);

    expect(replay.body).toEqual(first.body);
    expect(first.headers['cache-control']).toContain('no-store');
    expect(replay.headers['cache-control']).toContain('no-store');
    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(1);
  });
});
