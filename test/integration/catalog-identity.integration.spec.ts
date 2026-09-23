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
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import {
  CATALOG_ERROR_CODE,
  CatalogProductSlugAlreadyExistsError,
} from '../../src/modules/catalog/domain/catalog.repository';

describe('Product Slug Identity Integration', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let repo: PrismaCatalogRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    repo = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.test.example'),
    );
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

  describe('Part 2: Product Slug Uniqueness & Identity Hardening', () => {
    it('database rejects duplicate slug in the same shop with P2002 unique violation', async () => {
      const shop = await createTestShop(prisma);
      const category = await createTestCategory(prisma, shop.id);

      await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          code: uniqueCode('PROD_1'),
          name: 'Áo dài đỏ',
          slug: 'ao-dai-do',
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(100000),
        },
      });

      await expect(
        prisma.product.create({
          data: {
            shopId: shop.id,
            categoryId: category.id,
            code: uniqueCode('PROD_2'),
            name: 'Áo dài đỏ bản 2',
            slug: 'ao-dai-do',
            status: 'ACTIVE',
            isPublic: true,
            isRentable: true,
            defaultDepositAmount: new Prisma.Decimal(100000),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('database allows the same slug in different shops', async () => {
      const shopA = await createTestShop(prisma);
      const shopB = await createTestShop(prisma);
      const catA = await createTestCategory(prisma, shopA.id);
      const catB = await createTestCategory(prisma, shopB.id);

      const prodA = await prisma.product.create({
        data: {
          shopId: shopA.id,
          categoryId: catA.id,
          code: uniqueCode('PROD_A'),
          name: 'Áo dài đỏ Shop A',
          slug: 'ao-dai-do',
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(100000),
        },
      });

      const prodB = await prisma.product.create({
        data: {
          shopId: shopB.id,
          categoryId: catB.id,
          code: uniqueCode('PROD_B'),
          name: 'Áo dài đỏ Shop B',
          slug: 'ao-dai-do',
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(100000),
        },
      });

      expect(prodA.id).toBeDefined();
      expect(prodB.id).toBeDefined();
      expect(prodA.slug).toBe(prodB.slug);
    });

    it('createProduct throws CatalogProductSlugAlreadyExistsError when slug collides within same shop', async () => {
      const shop = await createTestShop(prisma);
      const category = await createTestCategory(prisma, shop.id);

      await repo.createProduct(shop.id, {
        code: uniqueCode('P1'),
        name: 'Váy hoa',
        slug: 'vay-hoa-xinh',
        categoryId: category.id,
        defaultDepositAmount: 50000,
        isPublic: true,
        variants: [
          {
            variantCode: uniqueCode('V1'),
            inventoryCount: 1,
            rentalRates: [{ durationDays: 1, price: 50000 }],
          },
        ],
        media: [],
      });

      await expect(
        repo.createProduct(shop.id, {
          code: uniqueCode('P2'),
          name: 'Váy hoa khác',
          slug: 'vay-hoa-xinh',
          categoryId: category.id,
          defaultDepositAmount: 50000,
          isPublic: true,
          variants: [
            {
              variantCode: uniqueCode('V2'),
              inventoryCount: 1,
              rentalRates: [{ durationDays: 1, price: 50000 }],
            },
          ],
          media: [],
        }),
      ).rejects.toMatchObject({
        constructor: CatalogProductSlugAlreadyExistsError,
        code: CATALOG_ERROR_CODE.PRODUCT_SLUG_ALREADY_EXISTS,
      });
    });

    it('updateProduct throws CatalogProductSlugAlreadyExistsError when updating slug to an existing slug in the same shop', async () => {
      const shop = await createTestShop(prisma);
      const category = await createTestCategory(prisma, shop.id);

      const prodA = await repo.createProduct(shop.id, {
        code: uniqueCode('PA'),
        name: 'Sản phẩm A',
        slug: 'slug-san-pham-a',
        categoryId: category.id,
        defaultDepositAmount: 50000,
        isPublic: true,
        variants: [
          {
            variantCode: uniqueCode('VA'),
            inventoryCount: 1,
            rentalRates: [{ durationDays: 1, price: 50000 }],
          },
        ],
        media: [],
      });
      expect(prodA.id).toBeDefined();

      const prodB = await repo.createProduct(shop.id, {
        code: uniqueCode('PB'),
        name: 'Sản phẩm B',
        slug: 'slug-san-pham-b',
        categoryId: category.id,
        defaultDepositAmount: 50000,
        isPublic: true,
        variants: [
          {
            variantCode: uniqueCode('VB'),
            inventoryCount: 1,
            rentalRates: [{ durationDays: 1, price: 50000 }],
          },
        ],
        media: [],
      });

      await expect(
        repo.updateProduct(shop.id, prodB.id, {
          slug: 'slug-san-pham-a',
        }),
      ).rejects.toBeInstanceOf(CatalogProductSlugAlreadyExistsError);
    });

    it('product rename preserves existing slug and does not mutate public URL', async () => {
      const shop = await createTestShop(prisma);
      const category = await createTestCategory(prisma, shop.id);

      const created = await repo.createProduct(shop.id, {
        code: uniqueCode('P_RENAME'),
        name: 'Tên ban đầu',
        slug: 'ten-ban-dau-slug',
        categoryId: category.id,
        defaultDepositAmount: 50000,
        isPublic: true,
        variants: [
          {
            variantCode: uniqueCode('V_RENAME'),
            inventoryCount: 1,
            rentalRates: [{ durationDays: 1, price: 50000 }],
          },
        ],
        media: [],
      });

      // Update name only without supplying slug
      const updated = await repo.updateProduct(shop.id, created.id, {
        name: 'Tên mới hoàn toàn khác',
      });

      expect(updated?.name).toBe('Tên mới hoàn toàn khác');
      expect(updated?.slug).toBe('ten-ban-dau-slug');

      // Verify in database directly
      const dbProduct = await prisma.product.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(dbProduct.name).toBe('Tên mới hoàn toàn khác');
      expect(dbProduct.slug).toBe('ten-ban-dau-slug');
    });

    it('archived product permanently reserves its slug in the shop', async () => {
      const shop = await createTestShop(prisma);
      const category = await createTestCategory(prisma, shop.id);

      const created = await repo.createProduct(shop.id, {
        code: uniqueCode('P_ARCHIVE'),
        name: 'Sản phẩm sắp lưu trữ',
        slug: 'slug-vinh-vien',
        categoryId: category.id,
        defaultDepositAmount: 50000,
        isPublic: true,
        variants: [
          {
            variantCode: uniqueCode('V_ARCHIVE'),
            inventoryCount: 1,
            rentalRates: [{ durationDays: 1, price: 50000 }],
          },
        ],
        media: [],
      });

      // Archive product
      await repo.archiveProduct(shop.id, created.id);

      // Attempting to create a new product with the same slug must fail (permanently reserved)
      await expect(
        repo.createProduct(shop.id, {
          code: uniqueCode('P_NEW'),
          name: 'Sản phẩm mới cố chiếm slug',
          slug: 'slug-vinh-vien',
          categoryId: category.id,
          defaultDepositAmount: 50000,
          isPublic: true,
          variants: [
            {
              variantCode: uniqueCode('V_NEW'),
              inventoryCount: 1,
              rentalRates: [{ durationDays: 1, price: 50000 }],
            },
          ],
          media: [],
        }),
      ).rejects.toBeInstanceOf(CatalogProductSlugAlreadyExistsError);
    });
  });

  describe('Part 3: Canonical Storefront Detail Lookup', () => {
    it('does not treat an existing public product code or UUID as a storefront slug', async () => {
      const shop = await createTestShop(prisma);
      const category = await createTestCategory(prisma, shop.id);
      const product = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          code: uniqueCode('PUBLIC_CODE'),
          name: 'Sản phẩm chỉ có slug canonical',
          slug: 'san-pham-canonical',
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(100000),
        },
      });
      await prisma.productVariant.create({
        data: {
          shopId: shop.id,
          productId: product.id,
          variantCode: `${product.code}-V1`,
          status: 'ACTIVE',
        },
      });

      await request(server).get(`/api/v1/web/products/${product.code}`).expect(404);
      await request(server).get(`/api/v1/web/products/${product.id}`).expect(404);
      await request(server).get('/api/v1/web/products/san-pham-canonical').expect(200);
    });
  });
});
