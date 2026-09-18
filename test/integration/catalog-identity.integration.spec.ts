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
import { CatalogProductSlugAlreadyExistsError } from '../../src/modules/catalog/domain/catalog.repository';

interface ProductDetailResponse {
  code: string;
  name: string;
  slug: string;
}

interface ErrorResponseBody {
  message: string;
}

const asDetail = (res: request.Response): ProductDetailResponse =>
  res.body as ProductDetailResponse;
const asError = (res: request.Response): ErrorResponseBody => res.body as ErrorResponseBody;

describe('Tenant Resolution & Product Slug Identity Integration', () => {
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

  describe('Part 1: Strict Tenant Resolution', () => {
    it('resolves the correct shop when a valid explicit shop code is supplied', async () => {
      const shop = await createTestShop(prisma);
      const category = await createTestCategory(prisma, shop.id);

      const product = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          code: uniqueCode('PROD_VALID'),
          name: 'Váy thiết kế hợp lệ',
          slug: 'vay-thiet-ke-hop-le',
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

      const res = await request(server)
        .get('/api/v1/web/products/vay-thiet-ke-hop-le')
        .set('x-shop-code', shop.code)
        .expect(200);

      expect(res.body).toMatchObject({
        code: product.code,
        slug: 'vay-thiet-ke-hop-le',
      });
    });

    it('returns 404 and does NOT fallback to another active shop when an explicit invalid shop code is supplied', async () => {
      // Create an active shop with a public product
      const activeShop = await createTestShop(prisma);
      const category = await createTestCategory(prisma, activeShop.id);

      const product = await prisma.product.create({
        data: {
          shopId: activeShop.id,
          categoryId: category.id,
          code: uniqueCode('PROD_ACTIVE'),
          name: 'Sản phẩm của shop active',
          slug: 'san-pham-shop-active',
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(100000),
        },
      });
      await prisma.productVariant.create({
        data: {
          shopId: activeShop.id,
          productId: product.id,
          variantCode: `${product.code}-V1`,
          status: 'ACTIVE',
        },
      });

      // Request using an explicit non-existent shop code
      const res = await request(server)
        .get('/api/v1/web/products/san-pham-shop-active')
        .set('x-shop-code', 'NON_EXISTENT_SHOP_CODE')
        .expect(404);

      expect(asError(res).message).toBe('Không tìm thấy cửa hàng hoạt động trong hệ thống.');
    });

    it('returns 404 and does NOT fallback when an explicit shop code belongs to an inactive or archived shop', async () => {
      const activeShop = await createTestShop(prisma);
      const category = await createTestCategory(prisma, activeShop.id);

      // Create an inactive shop
      const inactiveShop = await prisma.shop.create({
        data: {
          code: uniqueCode('INACTIVE_SHOP'),
          name: 'Cửa hàng ngừng hoạt động',
          status: 'INACTIVE',
        },
      });

      const product = await prisma.product.create({
        data: {
          shopId: activeShop.id,
          categoryId: category.id,
          code: uniqueCode('PROD_ACT'),
          name: 'Váy của shop active',
          slug: 'vay-shop-active',
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(100000),
        },
      });
      await prisma.productVariant.create({
        data: {
          shopId: activeShop.id,
          productId: product.id,
          variantCode: `${product.code}-V1`,
          status: 'ACTIVE',
        },
      });

      const res = await request(server)
        .get('/api/v1/web/products/vay-shop-active')
        .set('x-shop-code', inactiveShop.code)
        .expect(404);

      expect(asError(res).message).toBe('Không tìm thấy cửa hàng hoạt động trong hệ thống.');
    });

    it('preserves cross-tenant isolation: Shop A request cannot access Shop B product by slug', async () => {
      const shopA = await createTestShop(prisma);
      const shopB = await createTestShop(prisma);
      const catA = await createTestCategory(prisma, shopA.id);
      const catB = await createTestCategory(prisma, shopB.id);

      const prodA = await prisma.product.create({
        data: {
          shopId: shopA.id,
          categoryId: catA.id,
          code: uniqueCode('PROD_A'),
          name: 'Sản phẩm của Shop A',
          slug: 'product-slug-a',
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(100000),
        },
      });
      await prisma.productVariant.create({
        data: {
          shopId: shopA.id,
          productId: prodA.id,
          variantCode: `${prodA.code}-V1`,
          status: 'ACTIVE',
        },
      });

      const prodB = await prisma.product.create({
        data: {
          shopId: shopB.id,
          categoryId: catB.id,
          code: uniqueCode('PROD_B'),
          name: 'Sản phẩm của Shop B',
          slug: 'product-slug-b',
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(100000),
        },
      });
      await prisma.productVariant.create({
        data: {
          shopId: shopB.id,
          productId: prodB.id,
          variantCode: `${prodB.code}-V1`,
          status: 'ACTIVE',
        },
      });

      // Request scoped to Shop A attempting to access Shop B product slug -> 404
      await request(server)
        .get('/api/v1/web/products/product-slug-b')
        .set('x-shop-code', shopA.code)
        .expect(404);

      // Request scoped to Shop B attempting to access Shop A product slug -> 404
      await request(server)
        .get('/api/v1/web/products/product-slug-a')
        .set('x-shop-code', shopB.code)
        .expect(404);
    });
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
      ).rejects.toBeInstanceOf(CatalogProductSlugAlreadyExistsError);
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

  describe('Part 3: Cross-Tenant Public Detail Lookup with Identical Slugs', () => {
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
        data: { shopId: shop.id, productId: product.id, variantCode: `${product.code}-V1`, status: 'ACTIVE' },
      });

      await request(server)
        .get(`/api/v1/web/products/${product.code}`)
        .set('x-shop-code', shop.code)
        .expect(404);
      await request(server)
        .get(`/api/v1/web/products/${product.id}`)
        .set('x-shop-code', shop.code)
        .expect(404);
      await request(server)
        .get('/api/v1/web/products/san-pham-canonical')
        .set('x-shop-code', shop.code)
        .expect(200);
    });

    it('returns the product belonging to the resolved shop when two shops share the identical slug', async () => {
      const shopA = await createTestShop(prisma);
      const shopB = await createTestShop(prisma);
      const catA = await createTestCategory(prisma, shopA.id);
      const catB = await createTestCategory(prisma, shopB.id);

      const sharedSlug = 'classic-dress-shared';

      const prodA = await prisma.product.create({
        data: {
          shopId: shopA.id,
          categoryId: catA.id,
          code: uniqueCode('DRESS_A'),
          name: 'Đầm cổ điển Shop A',
          slug: sharedSlug,
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(150000),
        },
      });
      await prisma.productVariant.create({
        data: {
          shopId: shopA.id,
          productId: prodA.id,
          variantCode: `${prodA.code}-V1`,
          status: 'ACTIVE',
        },
      });

      const prodB = await prisma.product.create({
        data: {
          shopId: shopB.id,
          categoryId: catB.id,
          code: uniqueCode('DRESS_B'),
          name: 'Đầm cổ điển Shop B',
          slug: sharedSlug,
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
          defaultDepositAmount: new Prisma.Decimal(250000),
        },
      });
      await prisma.productVariant.create({
        data: {
          shopId: shopB.id,
          productId: prodB.id,
          variantCode: `${prodB.code}-V1`,
          status: 'ACTIVE',
        },
      });

      // Request for Shop A returns Product A only
      const resA = await request(server)
        .get(`/api/v1/web/products/${sharedSlug}`)
        .set('x-shop-code', shopA.code)
        .expect(200);

      expect(asDetail(resA).code).toBe(prodA.code);
      expect(asDetail(resA).name).toBe('Đầm cổ điển Shop A');

      // Request for Shop B returns Product B only
      const resB = await request(server)
        .get(`/api/v1/web/products/${sharedSlug}`)
        .set('x-shop-code', shopB.code)
        .expect(200);

      expect(asDetail(resB).code).toBe(prodB.code);
      expect(asDetail(resB).name).toBe('Đầm cổ điển Shop B');
    });
  });
});
