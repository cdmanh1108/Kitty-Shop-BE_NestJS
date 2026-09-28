import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

function accessCookie(accountId: string, expiresIn = 900, tokenMarker?: string): string {
  const token = new JwtService({ secret: process.env.WEB_JWT_ACCESS_SECRET }).sign(
    { sub: accountId, surface: 'web', tokenMarker },
    { algorithm: 'HS256', issuer: 'kitty-api', audience: 'kitty-web', expiresIn },
  );
  return `kitty_web_access=${token}`;
}

function checkoutRequest(variantId: string, phone: string) {
  return {
    customer: { name: 'Web checkout owner', phone },
    pickupDate: '2026-10-10',
    returnDate: '2026-10-12',
    items: [{ variantId, quantity: 1 }],
    delivery: { method: 'self_pickup' },
    paymentMethod: 'cash',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseStringField(text: string, field: string): string {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || typeof value[field] !== 'string') {
    throw new Error(`Expected response field ${field}`);
  }
  return value[field];
}

describe('Web rental checkout ownership', () => {
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
    await app?.close();
    await disconnectTestDatabase();
  });

  it('keeps guest checkout available and persists ONLINE with no account ownership', async () => {
    const fixture = await rentalScenario(prisma);
    const response = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Idempotency-Key', 'guest-ownerless-checkout')
      .send(checkoutRequest(fixture.variant.id, fixture.customer.phone))
      .expect(201);

    const order = await prisma.rentalOrder.findUniqueOrThrow({
      where: {
        shopId_orderNumber: {
          shopId: fixture.shop.id,
          orderNumber: responseStringField(response.text, 'orderCode'),
        },
      },
    });
    expect(order).toMatchObject({ source: 'ONLINE', webAccountId: null });
  });

  it('attaches only the authenticated WebAccount while keeping the CRM customer independent', async () => {
    const fixture = await rentalScenario(prisma);
    const account = await prisma.webAccount.create({
      data: { phone: '+84912345678', passwordHash: 'not-used', phoneVerifiedAt: new Date() },
    });
    const response = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', accessCookie(account.id))
      .set('Idempotency-Key', 'authenticated-owner-checkout')
      .send(checkoutRequest(fixture.variant.id, fixture.customer.phone))
      .expect(201);

    const order = await prisma.rentalOrder.findUniqueOrThrow({
      where: {
        shopId_orderNumber: {
          shopId: fixture.shop.id,
          orderNumber: responseStringField(response.text, 'orderCode'),
        },
      },
    });
    expect(order).toMatchObject({ source: 'ONLINE', webAccountId: account.id });
    expect(order.customerId).toBe(fixture.customer.id);
    expect(order.customerId).not.toBe(account.id);
  });

  it('rejects client-supplied ownership and does not create an order for a spoofed account', async () => {
    const fixture = await rentalScenario(prisma);
    const owner = await prisma.webAccount.create({
      data: { phone: '+84912345678', passwordHash: 'not-used', phoneVerifiedAt: new Date() },
    });
    const spoofed = await prisma.webAccount.create({
      data: { phone: '+84912345679', passwordHash: 'not-used', phoneVerifiedAt: new Date() },
    });

    await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', accessCookie(owner.id))
      .set('Idempotency-Key', 'ownership-spoof-checkout')
      .send({
        ...checkoutRequest(fixture.variant.id, fixture.customer.phone),
        webAccountId: spoofed.id,
      })
      .expect(400);

    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(0);
  });

  it('rejects a supplied invalid access credential rather than creating a guest order', async () => {
    const fixture = await rentalScenario(prisma);

    await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', 'kitty_web_access=tampered')
      .set('Idempotency-Key', 'invalid-auth-checkout')
      .send(checkoutRequest(fixture.variant.id, fixture.customer.phone))
      .expect(401);

    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(0);
  });

  it('rejects an expired access credential rather than silently creating a guest order', async () => {
    const fixture = await rentalScenario(prisma);
    const account = await prisma.webAccount.create({
      data: { phone: '+84912345678', passwordHash: 'not-used', phoneVerifiedAt: new Date() },
    });

    await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', accessCookie(account.id, -1))
      .set('Idempotency-Key', 'expired-auth-checkout')
      .send(checkoutRequest(fixture.variant.id, fixture.customer.phone))
      .expect(401);

    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(0);
  });

  it('binds an idempotency key to stable owner identity without leaking another owner order', async () => {
    const fixture = await rentalScenario(prisma);
    const first = await prisma.webAccount.create({
      data: { phone: '+84912345678', passwordHash: 'not-used', phoneVerifiedAt: new Date() },
    });
    const second = await prisma.webAccount.create({
      data: { phone: '+84912345679', passwordHash: 'not-used', phoneVerifiedAt: new Date() },
    });
    const body = checkoutRequest(fixture.variant.id, fixture.customer.phone);
    const key = 'owner-bound-idempotency-key';

    const created = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', accessCookie(first.id, 900, 'before-refresh'))
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const replay = await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', accessCookie(first.id, 900, 'after-refresh'))
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(replay.body).toEqual(created.body);

    await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Cookie', accessCookie(second.id))
      .set('Idempotency-Key', key)
      .send(body)
      .expect(409)
      .expect((response) =>
        expect(responseStringField(response.text, 'code')).toBe('IDEMPOTENCY_KEY_REUSED'),
      );

    await request(server)
      .post('/api/v1/web/rental-orders')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(409)
      .expect((response) =>
        expect(responseStringField(response.text, 'code')).toBe('IDEMPOTENCY_KEY_REUSED'),
      );

    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(1);
    await expect(
      prisma.rentalOrder.findFirstOrThrow({ where: { shopId: fixture.shop.id } }),
    ).resolves.toMatchObject({ webAccountId: first.id, source: 'ONLINE' });
  });
});
