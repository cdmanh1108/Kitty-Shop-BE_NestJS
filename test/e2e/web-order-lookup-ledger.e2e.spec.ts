import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import * as request from 'supertest';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { RentalReadPresenter } from '../../src/modules/rentals/application/rental-read.presenter';
import { getWithTx } from '../../src/modules/rentals/infrastructure/rental-queries';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { rentalScenario } from '../fixtures/rental.fixture';
import { uniqueCode } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';

describe('Web order lookup ledger projection', () => {
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

  it('projects the same signed non-deposit ledger total for Web and Admin without lookup writes', async () => {
    const fixture = await rentalScenario(prisma);
    const order = await prisma.rentalOrder.create({
      data: {
        shopId: fixture.shop.id,
        customerId: fixture.customer.id,
        orderNumber: uniqueCode('LOOKUP'),
        rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
        rentalEndAt: new Date('2026-10-12T00:00:00.000Z'),
        status: 'ACTIVE',
        rentalSubtotal: 500000,
        grandTotal: 500000,
        depositRequired: 300000,
      },
    });
    const finance = new PrismaFinanceRepository(prisma, {
      now: () => new Date('2026-10-01T12:00:00.000Z'),
    });
    const record = (input: {
      direction: 'IN' | 'OUT';
      purpose: 'RENTAL_PAYMENT' | 'DEPOSIT' | 'DEPOSIT_REFUND' | 'ORDER_REFUND';
      amount: number;
    }) =>
      finance.createPayment({
        shopId: fixture.shop.id,
        orderId: order.id,
        transactionNumber: uniqueCode('PAY'),
        paymentMethod: 'CASH',
        paidAt: new Date('2026-10-01T12:00:00.000Z'),
        createdBy: fixture.member.id,
        ...input,
      });

    // Real Finance writes: only the rental receipt initially contributes.
    await record({ direction: 'IN', purpose: 'RENTAL_PAYMENT', amount: 500000 });
    const root = await request(server)
      .post('/api/v1/web/rental-orders/lookup')
      .set('x-shop-code', fixture.shop.code)
      .send({ orderCode: order.orderNumber, phone: fixture.customer.phone })
      .expect(200);
    const rootBody = JSON.parse(root.text) as unknown as { paidAmount: number };
    expect(rootBody.paidAmount).toBe(500000);
    expect(typeof rootBody.paidAmount).toBe('number');

    // C06-compatible ledger records: deposits stay separate, an order refund is signed out.
    await record({ direction: 'IN', purpose: 'DEPOSIT', amount: 300000 });
    await record({ direction: 'OUT', purpose: 'DEPOSIT_REFUND', amount: 100000 });
    await record({ direction: 'OUT', purpose: 'ORDER_REFUND', amount: 50000 });
    // Synthetic malformed/non-eligible ledger row: the read predicate must ignore it.
    await prisma.paymentTransaction.create({
      data: {
        shopId: fixture.shop.id,
        orderId: order.id,
        customerId: fixture.customer.id,
        transactionNumber: uniqueCode('VOID'),
        direction: 'IN',
        purpose: 'RENTAL_PAYMENT',
        paymentMethod: 'CASH',
        amount: 999999,
        status: 'VOIDED',
        voidedAt: new Date('2026-10-01T12:01:00.000Z'),
      },
    });

    const before = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      select: { paymentStatus: true, status: true, grandTotal: true },
    });
    const beforePayments = await prisma.paymentTransaction.count({ where: { orderId: order.id } });
    const web = await request(server)
      .post('/api/v1/web/rental-orders/lookup')
      .set('x-shop-code', fixture.shop.code)
      .send({ orderCode: order.orderNumber, phone: fixture.customer.phone })
      .expect(200);
    const webBody = JSON.parse(web.text) as unknown as {
      paidAmount: number;
      depositAmount: number;
    };
    expect(webBody.paidAmount).toBe(450000);
    expect(webBody.depositAmount).toBe(300000);

    const adminRecord = await getWithTx(prisma, fixture.shop.id, order.id);
    const admin = new RentalReadPresenter({ resolve: (media) => media.url }).details(adminRecord);
    expect(admin?.paidAmount).toBe('450000');

    const after = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      select: { paymentStatus: true, status: true, grandTotal: true },
    });
    expect(after).toEqual(before);
    await expect(prisma.paymentTransaction.count({ where: { orderId: order.id } })).resolves.toBe(
      beforePayments,
    );
  });

  it('does not disclose a ledger total for a mismatched phone or foreign shop', async () => {
    const fixture = await rentalScenario(prisma);
    const order = await prisma.rentalOrder.create({
      data: {
        shopId: fixture.shop.id,
        customerId: fixture.customer.id,
        orderNumber: uniqueCode('PRIVATE'),
        rentalStartAt: new Date('2026-10-10T00:00:00.000Z'),
        rentalEndAt: new Date('2026-10-12T00:00:00.000Z'),
        grandTotal: 500000,
      },
    });
    const response = await request(server)
      .post('/api/v1/web/rental-orders/lookup')
      .set('x-shop-code', fixture.shop.code)
      .send({ orderCode: order.orderNumber, phone: '0999999999' })
      .expect(404);
    expect(response.body).not.toHaveProperty('paidAmount');
    expect(response.body).not.toHaveProperty('customerName');
  });
});
