import { createTestUserAndMember } from '../fixtures/test-factories';
import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  connectTestDatabase,
  resetTestDatabase,
  disconnectTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';
import { generateTestAccessToken } from '../helpers/auth-helper';
import { rentalScenario } from '../fixtures/rental.fixture';

describe('Catalog read HTTP contracts', () => {
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

  it('routes static reads before detail IDs, validates bounds and enforces read permissions', async () => {
    const fixture = await rentalScenario(prisma);
    const token = generateTestAccessToken(fixture.principal);
    for (const path of [
      '/admin/products/lookup',
      '/admin/inventory/summary',
      '/admin/inventory/history',
    ]) {
      await request(server)
        .get('/api/v1' + path)
        .set('Authorization', 'Bearer ' + token)
        .expect(200);
      await request(server)
        .get('/api/v1' + path)
        .expect(401);
    }
    for (const path of [
      '/admin/products/lookup?limit=51',
      '/admin/products/lookup?page=0',
      '/admin/inventory/history?limit=101',
      '/admin/inventory/history?productId=bad',
      '/admin/products?limit=101',
      '/admin/inventory?limit=101',
    ]) {
      await request(server)
        .get('/api/v1' + path)
        .set('Authorization', 'Bearer ' + token)
        .expect(400);
    }
    const restricted = await createTestUserAndMember(prisma, fixture.shop.id, { permissions: [] });
    const denied = generateTestAccessToken({
      shopId: fixture.shop.id,
      userId: restricted.user.id,
      memberId: restricted.member.id,
    });
    await request(server)
      .get('/api/v1/admin/inventory/summary')
      .set('Authorization', 'Bearer ' + denied)
      .expect(403);
    await request(server)
      .get('/api/v1/admin/products/lookup')
      .set('Authorization', 'Bearer ' + denied)
      .expect(403);
    await request(server)
      .get('/api/v1/admin/inventory/history?shopId=' + fixture.shop.id)
      .set('Authorization', 'Bearer ' + token)
      .expect(400);
  });
});
