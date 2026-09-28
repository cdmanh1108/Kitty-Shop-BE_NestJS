import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { RentalOrderSource } from '@prisma/client';
import type { Server } from 'node:http';
import * as request from 'supertest';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { rentalScenario } from '../fixtures/rental.fixture';
import { uniqueCode } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';

interface RentalOrderListResponse {
  items: unknown[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

function rentalOrderListResponse(text: string): RentalOrderListResponse {
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== 'object' ||
    !('items' in value) ||
    !Array.isArray(value.items) ||
    !('meta' in value) ||
    !value.meta ||
    typeof value.meta !== 'object' ||
    !('page' in value.meta) ||
    !('limit' in value.meta) ||
    !('total' in value.meta) ||
    !('totalPages' in value.meta) ||
    typeof value.meta.page !== 'number' ||
    typeof value.meta.limit !== 'number' ||
    typeof value.meta.total !== 'number' ||
    typeof value.meta.totalPages !== 'number'
  ) {
    throw new Error('Expected a paginated Web account rental-order response');
  }
  return value as RentalOrderListResponse;
}

function accessCookie(accountId: string): string {
  const token = new JwtService({ secret: process.env.WEB_JWT_ACCESS_SECRET }).sign(
    { sub: accountId, surface: 'web' },
    { algorithm: 'HS256', issuer: 'kitty-api', audience: 'kitty-web', expiresIn: 900 },
  );
  return `kitty_web_access=${token}`;
}

describe('Web account rental orders', () => {
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

  async function createAccount(phone: string) {
    return prisma.webAccount.create({
      data: { phone, passwordHash: 'not-used', phoneVerifiedAt: new Date() },
    });
  }

  async function createOrder(
    fixture: Awaited<ReturnType<typeof rentalScenario>>,
    options: {
      webAccountId?: string | null;
      source?: RentalOrderSource;
      status?: string;
      createdAt?: Date;
      quantity?: number;
      internalNote?: string;
    } = {},
  ) {
    const createdAt = options.createdAt ?? new Date('2026-10-01T00:00:00.000Z');
    return prisma.rentalOrder.create({
      data: {
        shopId: fixture.shop.id,
        customerId: fixture.customer.id,
        webAccountId: options.webAccountId ?? null,
        source: options.source ?? 'ONLINE',
        orderNumber: uniqueCode('WEB_ACCOUNT_ORDER'),
        rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
        rentalEndAt: new Date('2026-10-12T00:00:00.000Z'),
        status: options.status ?? 'RESERVED',
        rentalSubtotal: 400000,
        chargesTotal: 30000,
        discountTotal: 0,
        grandTotal: 430000,
        depositRequired: 500000,
        preferredPaymentMethod: 'bank_transfer',
        internalNote: options.internalNote,
        metadata: { private: 'do-not-expose' },
        createdAt,
        items: {
          create: {
            shopId: fixture.shop.id,
            productId: fixture.product.id,
            variantId: fixture.variant.id,
            quantity: options.quantity ?? 1,
            rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
            rentalEndAt: new Date('2026-10-12T00:00:00.000Z'),
            productNameSnapshot: fixture.product.name,
            variantNameSnapshot: fixture.variant.variantCode,
            skuSnapshot: 'private-sku',
            unitRentalPrice: 400000,
            lineTotal: 400000,
            depositAmount: 500000,
          },
        },
      },
    });
  }

  it('requires a signed-in Web account', async () => {
    await request(server).get('/api/v1/web/account/rental-orders').expect(401);
  });

  it('lists only ONLINE orders owned by the authenticated account with stable newest-first paging', async () => {
    const fixture = await rentalScenario(prisma);
    const owner = await createAccount('+84912345678');
    const other = await createAccount('+84912345679');
    const older = await createOrder(fixture, {
      webAccountId: owner.id,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      quantity: 4,
    });
    const newer = await createOrder(fixture, {
      webAccountId: owner.id,
      status: 'ACTIVE',
      createdAt: new Date('2026-10-02T00:00:00.000Z'),
    });
    await createOrder(fixture, { webAccountId: other.id });
    await createOrder(fixture, { webAccountId: null });
    await createOrder(fixture, { webAccountId: owner.id, source: 'OFFLINE' });

    const response = await request(server)
      .get('/api/v1/web/account/rental-orders?page=1&limit=1')
      .set('Cookie', accessCookie(owner.id))
      .expect(200);

    expect(response.body).toMatchObject({
      meta: { page: 1, limit: 1, total: 2, totalPages: 2 },
      items: [{ orderCode: newer.orderNumber, itemCount: 1 }],
    });
    expect(response.headers['cache-control']).toBe('private, no-store');

    const secondPage = await request(server)
      .get('/api/v1/web/account/rental-orders?page=2&limit=1')
      .set('Cookie', accessCookie(owner.id))
      .expect(200);
    expect(rentalOrderListResponse(secondPage.text).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderCode: older.orderNumber, itemCount: 4 }),
      ]),
    );

    const filtered = await request(server)
      .get('/api/v1/web/account/rental-orders?status=ACTIVE')
      .set('Cookie', accessCookie(owner.id))
      .expect(200);
    const filteredBody = rentalOrderListResponse(filtered.text);
    expect(filteredBody.meta.total).toBe(1);
    expect(filteredBody.items[0]).toMatchObject({
      orderCode: newer.orderNumber,
      status: 'ACTIVE',
    });
  });

  it('rejects invalid filters and pagination before querying the account history', async () => {
    const fixture = await rentalScenario(prisma);
    const owner = await createAccount('+84912345678');
    await createOrder(fixture, { webAccountId: owner.id });

    await request(server)
      .get('/api/v1/web/account/rental-orders?status=NOT_A_STATUS')
      .set('Cookie', accessCookie(owner.id))
      .expect(400);
    await request(server)
      .get('/api/v1/web/account/rental-orders?page=0&limit=101')
      .set('Cookie', accessCookie(owner.id))
      .expect(400);
  });

  it('returns a deliberately narrow detail projection only to its owner', async () => {
    const fixture = await rentalScenario(prisma);
    const owner = await createAccount('+84912345678');
    const order = await createOrder(fixture, {
      webAccountId: owner.id,
      internalNote: 'staff-only note',
    });
    await prisma.deliveryJob.create({
      data: {
        shopId: fixture.shop.id,
        orderId: order.id,
        direction: 'OUTBOUND',
        method: 'DELIVERY',
        recipientName: 'Web customer',
        recipientPhone: '0912345678',
        addressLine: 'Can Tho',
        shippingFee: 30000,
      },
    });
    await prisma.rentalOrderStatusHistory.create({
      data: { shopId: fixture.shop.id, orderId: order.id, toStatus: 'RESERVED' },
    });

    const response = await request(server)
      .get(`/api/v1/web/account/rental-orders/${order.orderNumber}`)
      .set('Cookie', accessCookie(owner.id))
      .expect(200);

    expect(response.body).toMatchObject({
      orderCode: order.orderNumber,
      items: [expect.objectContaining({ productId: fixture.product.id, quantity: 1 })],
      deliveries: [expect.objectContaining({ recipientName: 'Web customer', shippingFee: 30000 })],
      timeline: [expect.objectContaining({ status: 'RESERVED' })],
    });
    const body = JSON.stringify(response.body);
    for (const forbiddenField of [
      '"webAccountId"',
      '"customerId"',
      '"internalNote"',
      'private-sku',
      '"allocations"',
      '"payments"',
      '"metadata"',
    ]) {
      expect(body).not.toContain(forbiddenField);
    }
  });

  it('returns 404 without revealing foreign, guest, offline, or unknown orders', async () => {
    const fixture = await rentalScenario(prisma);
    const owner = await createAccount('+84912345678');
    const other = await createAccount('+84912345679');
    const foreign = await createOrder(fixture, { webAccountId: other.id });
    const guest = await createOrder(fixture, { webAccountId: null });
    const offline = await createOrder(fixture, { webAccountId: owner.id, source: 'OFFLINE' });

    for (const orderCode of [
      foreign.orderNumber,
      guest.orderNumber,
      offline.orderNumber,
      'RT-NOT-FOUND',
    ]) {
      await request(server)
        .get(`/api/v1/web/account/rental-orders/${orderCode}`)
        .set('Cookie', accessCookie(owner.id))
        .expect(404)
        .expect((result) => {
          expect(result.body).not.toHaveProperty('orderCode');
          expect(result.body).not.toHaveProperty('items');
        });
    }
  });
});
