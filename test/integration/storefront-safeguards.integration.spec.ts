import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';
import { createTestCategory, createTestShop, uniqueCode } from '../fixtures/test-factories';

interface ErrorResponseBody {
  statusCode: number;
  message: string;
  requestId: string;
}

interface DetailResponseBody {
  slug: string;
}

describe('Storefront Production Integration Safeguards', () => {
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

  describe('Request ID (Correlation ID) Propagation', () => {
    it('echoes incoming x-request-id in response headers on GET /api/v1/web/products', async () => {
      const shop = await createTestShop(prisma);
      const customRequestId = 'req-trace-test-12345';

      const res = await request(server)
        .get('/api/v1/web/products')
        .set('x-shop-code', shop.code)
        .set('x-request-id', customRequestId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customRequestId);
    });

    it('generates a valid UUID x-request-id when none is supplied', async () => {
      const shop = await createTestShop(prisma);

      const res = await request(server).get('/api/v1/web/products').set('x-shop-code', shop.code);

      expect(res.status).toBe(200);
      const generatedId = res.headers['x-request-id'];
      expect(typeof generatedId).toBe('string');
      expect(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          generatedId as string,
        ),
      ).toBe(true);
    });

    it('replaces an invalid or malformed x-request-id with a generated UUID', async () => {
      const shop = await createTestShop(prisma);
      const maliciousId = 'bad-id-with-special-chars-<>!@#$%^&*()';

      const res = await request(server)
        .get('/api/v1/web/products')
        .set('x-shop-code', shop.code)
        .set('x-request-id', maliciousId);

      expect(res.status).toBe(200);
      const finalId = res.headers['x-request-id'];
      expect(finalId).not.toBe(maliciousId);
      expect(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          finalId as string,
        ),
      ).toBe(true);
    });
  });

  describe('Error Response Safeguards & Correlation Consistency', () => {
    it('includes matching requestId in 404 error envelope when product is not found', async () => {
      const shop = await createTestShop(prisma);
      const customRequestId = 'req-not-found-slug-99';

      const res = await request(server)
        .get('/api/v1/web/products/non-existent-slug-xyz')
        .set('x-shop-code', shop.code)
        .set('x-request-id', customRequestId);

      expect(res.status).toBe(404);
      expect(res.headers['x-request-id']).toBe(customRequestId);
      expect(res.body).toMatchObject({
        statusCode: 404,
        requestId: customRequestId,
      });
      expect((res.body as ErrorResponseBody).message).toBe('Không tìm thấy sản phẩm.');
    });

    it('includes matching requestId in 400 validation error envelope when query is invalid', async () => {
      const shop = await createTestShop(prisma);
      const customRequestId = 'req-bad-query-input-77';

      const res = await request(server)
        .get('/api/v1/web/products?page=-1')
        .set('x-shop-code', shop.code)
        .set('x-request-id', customRequestId);

      expect(res.status).toBe(400);
      expect(res.headers['x-request-id']).toBe(customRequestId);
      expect(res.body).toMatchObject({
        statusCode: 400,
        requestId: customRequestId,
      });
    });

    it('includes matching requestId in 404 error envelope when shop code is invalid', async () => {
      const customRequestId = 'req-unknown-shop-code';

      const res = await request(server)
        .get('/api/v1/web/products')
        .set('x-shop-code', 'NON_EXISTENT_SHOP_CODE')
        .set('x-request-id', customRequestId);

      expect(res.status).toBe(404);
      expect(res.headers['x-request-id']).toBe(customRequestId);
      expect(res.body).toMatchObject({
        statusCode: 404,
        requestId: customRequestId,
      });
    });
  });

  describe('Storefront Detail Isolation & Tenant Boundary', () => {
    it('returns 200 for a public product under the correct shop, but 404 for another shop', async () => {
      const shopA = await createTestShop(prisma);
      const shopB = await createTestShop(prisma);
      const categoryA = await createTestCategory(prisma, shopA.id);

      const product = await prisma.product.create({
        data: {
          shopId: shopA.id,
          categoryId: categoryA.id,
          code: uniqueCode('PROD_SAFE'),
          name: 'Váy an toàn kiểm thử',
          slug: 'vay-an-toan-kiem-thu',
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(100000),
        },
      });
      await prisma.productVariant.create({
        data: {
          shopId: shopA.id,
          productId: product.id,
          variantCode: `${product.code}-V1`,
          status: 'ACTIVE',
        },
      });

      // Query from shop A -> 200
      const resA = await request(server)
        .get(`/api/v1/web/products/${product.slug}`)
        .set('x-shop-code', shopA.code);
      expect(resA.status).toBe(200);
      expect((resA.body as DetailResponseBody).slug).toBe(product.slug);

      // Query from shop B -> 404
      const resB = await request(server)
        .get(`/api/v1/web/products/${product.slug}`)
        .set('x-shop-code', shopB.code);
      expect(resB.status).toBe(404);
    });
  });
});
