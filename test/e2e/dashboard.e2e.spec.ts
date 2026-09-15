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

describe('Dashboard HTTP authorization', () => {
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

  it('requires dashboard.view and works without customers, rentals or finance permissions', async () => {
    const shop = await createTestShop(prisma);
    const allowed = await createTestUserAndMember(prisma, shop.id, {
      permissions: ['dashboard.view'],
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
    await request(server).get('/api/v1/dashboard/summary').expect(401);
    await request(server)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token(denied)}`)
      .expect(403);
    const result = await request(server)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token(allowed)}`)
      .expect(200);
    expect(result.body).toMatchObject({ revenueToday: 0, upcomingOrders: [], attentionOrders: [] });
  });
});
