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
import { createTestProductWithVariant, createTestShop } from '../fixtures/test-factories';

function cookieFor(accountId: string): string {
  const token = new JwtService({ secret: process.env.WEB_JWT_ACCESS_SECRET }).sign(
    { sub: accountId, surface: 'web' },
    { algorithm: 'HS256', issuer: 'kitty-api', audience: 'kitty-web', expiresIn: 900 },
  );
  return `kitty_web_access=${token}`;
}

describe('Account favorites end-to-end', () => {
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

  it('requires a web session, persists idempotently, and never crosses account boundaries', async () => {
    const shop = await createTestShop(prisma);
    const { product } = await createTestProductWithVariant(prisma, shop.id);
    const first = await prisma.webAccount.create({
      data: { phone: '+84912345678', passwordHash: 'not-used', phoneVerifiedAt: new Date() },
    });
    const second = await prisma.webAccount.create({
      data: { phone: '+84912345679', passwordHash: 'not-used', phoneVerifiedAt: new Date() },
    });
    const firstCookie = cookieFor(first.id);
    const secondCookie = cookieFor(second.id);

    await request(server).get('/api/v1/web/favorites').expect(401);
    await request(server)
      .put(`/api/v1/web/favorites/${product.id}`)
      .set('Cookie', firstCookie)
      .set('Content-Type', 'application/json')
      .expect(200)
      .expect((response) =>
        expect(response.body).toEqual({ productId: product.id, isFavorite: true, total: 1 }),
      );
    await request(server)
      .put(`/api/v1/web/favorites/${product.id}`)
      .set('Cookie', firstCookie)
      .set('Content-Type', 'application/json')
      .expect(200)
      .expect((response) =>
        expect(response.body).toEqual({ productId: product.id, isFavorite: true, total: 1 }),
      );
    await request(server)
      .get('/api/v1/web/favorites')
      .set('Cookie', firstCookie)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          meta: { total: 1 },
          items: [{ id: product.id }],
        });
      });
    await request(server)
      .get(`/api/v1/web/favorites/status?productIds=${product.id}`)
      .set('Cookie', firstCookie)
      .expect(200)
      .expect((response) => expect(response.body).toEqual({ productIds: [product.id], total: 1 }));

    await request(server)
      .delete(`/api/v1/web/favorites/${product.id}`)
      .set('Cookie', secondCookie)
      .set('Content-Type', 'application/json')
      .expect(200)
      .expect((response) =>
        expect(response.body).toEqual({ productId: product.id, isFavorite: false, total: 0 }),
      );
    await request(server)
      .get('/api/v1/web/favorites')
      .set('Cookie', firstCookie)
      .expect((response) => expect(response.body).toMatchObject({ meta: { total: 1 } }));
  });
});
