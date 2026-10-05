import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { createTestShop } from '../fixtures/test-factories';

const draft = {
  pickupDate: '2026-10-01',
  returnDate: '2026-10-03',
  items: [
    {
      productId: '00000000-0000-4000-8000-000000000001',
      variantId: '00000000-0000-4000-8000-000000000002',
      quantity: 1,
    },
  ],
};

describe('Account cart end-to-end', () => {
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

  it('requires a web session and persists a versioned draft for that account', async () => {
    await createTestShop(prisma);
    const account = await prisma.webAccount.create({
      data: {
        phone: '+84912345678',
        passwordHash: 'not-used-by-this-session-test',
        phoneVerifiedAt: new Date(),
      },
    });
    const token = new JwtService({ secret: process.env.WEB_JWT_ACCESS_SECRET }).sign(
      { sub: account.id, surface: 'web' },
      { algorithm: 'HS256', issuer: 'kitty-api', audience: 'kitty-web', expiresIn: 900 },
    );
    const cookie = `kitty_web_access=${token}`;

    await request(server).get('/api/v1/web/cart').expect(401);
    await request(server)
      .get('/api/v1/web/cart')
      .set('Cookie', cookie)
      .expect(200)
      .expect({ cart: null });

    await request(server)
      .put('/api/v1/web/cart')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send({ ...draft, version: 0 })
      .expect(200)
      .expect({ ...draft, version: 1 });
  });
});
