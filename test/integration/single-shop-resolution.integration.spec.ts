import * as request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { createTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestShop } from '../fixtures/test-factories';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

describe('single-shop runtime resolution (PostgreSQL)', () => {
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

  it('serves public requests when exactly one active shop exists and ignores a legacy header', async () => {
    await createTestShop(prisma);

    await request(server)
      .get('/api/v1/web/categories')
      .set('x-shop-code', 'ignored-legacy-value')
      .expect(200);
  });

  it('fails clearly when no shop exists', async () => {
    const response = await request(server).get('/api/v1/web/categories').expect(503);

    expect(JSON.stringify(response.body)).toContain('chưa có cửa hàng nào');
  });

  it('fails clearly when more than one shop exists instead of selecting one', async () => {
    await createTestShop(prisma, { code: 'SHOP_A' });
    await createTestShop(prisma, { code: 'SHOP_B' });

    const response = await request(server).get('/api/v1/web/categories').expect(503);
    expect(JSON.stringify(response.body)).toContain('nhiều cửa hàng');
  });
});
