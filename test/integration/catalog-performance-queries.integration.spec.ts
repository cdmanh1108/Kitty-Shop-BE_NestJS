import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';
import { createTestShop, createTestProductWithVariant } from '../fixtures/test-factories';

type ProductListResponse = {
  items: Array<Record<string, unknown> & { name: string }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
};

describe('Storefront catalog query contract', () => {
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
    if (app) await app.close();
    await disconnectTestDatabase();
  });

  it('sorts catalog names deterministically across pages and exposes no catalog rate snapshots', async () => {
    const shop = await createTestShop(prisma);
    const items = await Promise.all(
      ['Zeta', 'Alpha', 'Mango'].map(() => createTestProductWithVariant(prisma, shop.id)),
    );
    await Promise.all(
      items.map(({ product }, index) =>
        prisma.product.update({
          where: { id: product.id },
          data: { name: ['Zeta', 'Alpha', 'Mango'][index]! },
        }),
      ),
    );

    const first = (
      await request(server).get('/api/v1/web/products?sort=name_asc&page=1&limit=2').expect(200)
    ).body as ProductListResponse;
    const second = (
      await request(server).get('/api/v1/web/products?sort=name_asc&page=2&limit=2').expect(200)
    ).body as ProductListResponse;

    expect(first.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect([...first.items, ...second.items].map((item) => item.name)).toEqual([
      'Alpha',
      'Mango',
      'Zeta',
    ]);
    for (const item of [...first.items, ...second.items])
      expect(item).not.toHaveProperty('rentalPrices');
  });
});
