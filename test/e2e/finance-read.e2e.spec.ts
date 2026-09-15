import * as request from 'supertest';
import { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  connectTestDatabase,
  resetTestDatabase,
  disconnectTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';
import { generateTestAccessToken } from '../helpers/auth-helper';
import { createTestShop, createTestUserAndMember } from '../fixtures/test-factories';

function isHttpServer(value: unknown): value is Server {
  return value instanceof Server;
}

describe('Finance HTTP authorization and validation', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    app = await createTestApp();
    const httpServer: unknown = app.getHttpServer();
    if (!isHttpServer(httpServer)) throw new Error('Expected a Node HTTP server');
    server = httpServer;
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(async () => {
    if (app) await app.close();
    await disconnectTestDatabase();
  });

  it('requires finance.view and separately enforces expense management', async () => {
    const shop = await createTestShop(prisma);
    const allowed = await createTestUserAndMember(prisma, shop.id, {
      permissions: ['finance.view'],
    });
    const denied = await createTestUserAndMember(prisma, shop.id, {
      permissions: ['rentals.view'],
    });
    const token = (identity: typeof allowed) =>
      generateTestAccessToken({
        shopId: shop.id,
        userId: identity.user.id,
        memberId: identity.member.id,
      });
    await request(server).get('/api/v1/finance/summary').expect(401);
    await request(server)
      .get('/api/v1/finance/summary')
      .set('Authorization', `Bearer ${token(denied)}`)
      .expect(403);
    const result = await request(server)
      .get('/api/v1/finance/summary')
      .set('Authorization', `Bearer ${token(allowed)}`)
      .expect(200);
    expect(result.body).toMatchObject({
      totalRevenue: '0',
      totalExpenses: '0',
      profit: '0',
      breakdown: [],
    });
    await request(server)
      .get('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${token(denied)}`)
      .expect(403);
    await request(server)
      .get('/api/v1/finance/transactions')
      .set('Authorization', `Bearer ${token(allowed)}`)
      .expect(200);
    await request(server)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${token(allowed)}`)
      .send({})
      .expect(403);
    for (const query of [
      'preset=invalid',
      'preset=custom&from=2026-02-30&to=2026-03-01',
      'preset=custom&from=2026-09-20&to=2026-09-01',
      'direction=IN',
      'category=DEPOSIT',
      'page=0',
      'limit=101',
    ]) {
      await request(server)
        .get('/api/v1/finance/transactions?' + query)
        .set('Authorization', `Bearer ${token(allowed)}`)
        .expect(400);
    }
    const manager = await createTestUserAndMember(prisma, shop.id, {
      permissions: ['finance.view', 'finance.manage'],
    });
    const category = await prisma.expenseCategory.create({
      data: { shopId: shop.id, code: 'LAUNDRY', name: 'Giặt hấp' },
    });
    const categories = await request(server)
      .get('/api/v1/expense-categories')
      .set('Authorization', `Bearer ${token(manager)}`)
      .expect(200);
    expect(categories.body).toEqual([{ id: category.id, name: 'Giặt hấp' }]);
    const body = {
      categoryId: category.id,
      description: 'Giặt hấp sản phẩm',
      amount: 120000,
      expenseDate: '2026-09-15',
    };
    await request(server)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${token(manager)}`)
      .send({ ...body, expenseDate: '2026-02-30' })
      .expect(400);
    await request(server)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${token(manager)}`)
      .send(body)
      .expect(201);
    expect(
      await prisma.expense.count({ where: { shopId: shop.id, createdBy: manager.member.id } }),
    ).toBe(1);
    expect(await prisma.auditLog.count({ where: { shopId: shop.id, entityType: 'expense' } })).toBe(
      1,
    );
    const totals = await request(server)
      .get('/api/v1/finance/summary?preset=custom&from=2026-09-15&to=2026-09-15')
      .set('Authorization', `Bearer ${token(manager)}`)
      .expect(200);
    expect(totals.body).toMatchObject({ totalExpenses: '120000.00', profit: '-120000.00' });
    const otherShop = await createTestShop(prisma);
    const foreign = await prisma.expenseCategory.create({
      data: { shopId: otherShop.id, code: 'OTHER', name: 'Khác' },
    });
    await request(server)
      .post('/api/v1/expenses')
      .set('Authorization', `Bearer ${token(manager)}`)
      .send({ ...body, categoryId: foreign.id })
      .expect(400);
  });
});
