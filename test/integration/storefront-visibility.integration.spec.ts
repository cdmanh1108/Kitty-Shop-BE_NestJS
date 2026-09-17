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

interface ProductItemResponse {
  id: string;
  code: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  rentalPrices: Array<{ days: number; amount: number }>;
}

interface ProductListResponse {
  items: ProductItemResponse[];
  meta: { total: number };
}

interface ProductDetailResponse extends ProductItemResponse {
  variants: Array<{ id: string; code: string }>;
}

interface ErrorResponseBody {
  message: string;
}

const asListResponse = (res: request.Response): ProductListResponse => {
  return res.body as ProductListResponse;
};

const asDetailResponse = (res: request.Response): ProductDetailResponse => {
  return res.body as ProductDetailResponse;
};

const asErrorResponse = (res: request.Response): ErrorResponseBody => {
  return res.body as ErrorResponseBody;
};

describe('Storefront Product Visibility Boundary Integration', () => {
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

  it('enforces product list visibility rule: only public, rentable, unarchived, active products in current shop are returned', async () => {
    const shop = await createTestShop(prisma);
    const otherShop = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);
    const otherCategory = await createTestCategory(prisma, otherShop.id);

    // Product A: Valid Public
    const prodA = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('PROD_A'),
        name: 'Đầm dạ hội công khai',
        slug: 'dam-da-hoi-cong-khai',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
        defaultDepositAmount: new Prisma.Decimal(200000),
      },
    });
    await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: prodA.id,
        variantCode: `${prodA.code}-V1`,
        status: 'ACTIVE',
      },
    });

    // Product B: isPublic = false
    const prodB = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('PROD_B'),
        name: 'Đầm dạ hội nội bộ',
        slug: 'dam-da-hoi-noi-bo',
        status: 'ACTIVE',
        isPublic: false,
        isRentable: true,
        defaultDepositAmount: new Prisma.Decimal(200000),
      },
    });
    await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: prodB.id,
        variantCode: `${prodB.code}-V1`,
        status: 'ACTIVE',
      },
    });

    // Product C: archived (archivedAt != null, status = ARCHIVED)
    const prodC = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('PROD_C'),
        name: 'Đầm dạ hội lưu trữ',
        slug: 'dam-da-hoi-luu-tru',
        status: 'ARCHIVED',
        isPublic: true,
        isRentable: true,
        archivedAt: new Date(),
        defaultDepositAmount: new Prisma.Decimal(200000),
      },
    });
    await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: prodC.id,
        variantCode: `${prodC.code}-V1`,
        status: 'ACTIVE',
      },
    });

    // Product D: non-rentable (isRentable = false)
    const prodD = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('PROD_D'),
        name: 'Đầm không cho thuê',
        slug: 'dam-khong-cho-thue',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: false,
        defaultDepositAmount: new Prisma.Decimal(200000),
      },
    });
    await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: prodD.id,
        variantCode: `${prodD.code}-V1`,
        status: 'ACTIVE',
      },
    });

    // Product E: storefront-disallowed status (status = INACTIVE)
    const prodE = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('PROD_E'),
        name: 'Đầm ngừng kinh doanh',
        slug: 'dam-ngung-kinh-doanh',
        status: 'INACTIVE',
        isPublic: true,
        isRentable: true,
        defaultDepositAmount: new Prisma.Decimal(200000),
      },
    });
    await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: prodE.id,
        variantCode: `${prodE.code}-V1`,
        status: 'ACTIVE',
      },
    });

    // Product F: other shop (cross-tenant product)
    const prodF = await prisma.product.create({
      data: {
        shopId: otherShop.id,
        categoryId: otherCategory.id,
        code: uniqueCode('PROD_F'),
        name: 'Đầm cửa hàng khác',
        slug: 'dam-cua-hang-khac',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
        defaultDepositAmount: new Prisma.Decimal(200000),
      },
    });
    await prisma.productVariant.create({
      data: {
        shopId: otherShop.id,
        productId: prodF.id,
        variantCode: `${prodF.code}-V1`,
        status: 'ACTIVE',
      },
    });

    // 1. Direct repository test
    const repoResult = await repo.listStorefrontProducts({
      shopId: shop.id,
      page: 1,
      limit: 20,
    });
    const repoIds = repoResult.items.map((p) => p.id);
    expect(repoIds).toContain(prodA.id);
    expect(repoIds).not.toContain(prodB.id);
    expect(repoIds).not.toContain(prodC.id);
    expect(repoIds).not.toContain(prodD.id);
    expect(repoIds).not.toContain(prodE.id);
    expect(repoIds).not.toContain(prodF.id);
    expect(repoResult.meta.total).toBe(1);

    // 2. HTTP Web API test
    const httpRes = await request(server)
      .get('/api/v1/web/products')
      .set('x-shop-code', shop.code)
      .expect(200);

    const httpBody = asListResponse(httpRes);
    expect(httpBody.items).toHaveLength(1);
    expect(httpBody.items[0]?.id).toBe(prodA.id);
    expect(httpBody.meta.total).toBe(1);

    // Whitelist check: internal fields must NOT exist in public response
    const firstItem = httpBody.items[0] as unknown as Record<string, unknown>;
    expect(firstItem).not.toHaveProperty('replacementValue');
    expect(firstItem).not.toHaveProperty('purchasePrice');
    expect(firstItem).not.toHaveProperty('metadata');
    expect(firstItem).not.toHaveProperty('shopId');
    expect(firstItem).not.toHaveProperty('tags');
    expect(firstItem).not.toHaveProperty('featured');
  });

  it('enforces product detail visibility: hidden, private, archived, inactive, or wrong-shop products return 404', async () => {
    const shop = await createTestShop(prisma);
    const otherShop = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);
    const otherCategory = await createTestCategory(prisma, otherShop.id);

    // Valid public product
    const validProd = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('VALID'),
        name: 'Váy công khai',
        slug: 'vay-cong-khai-chuan',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
        description: 'Mô tả công khai',
        defaultDepositAmount: new Prisma.Decimal(150000),
      },
    });
    await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: validProd.id,
        variantCode: `${validProd.code}-V1`,
        status: 'ACTIVE',
      },
    });

    // Excluded products
    const privateProd = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('PRIV'),
        name: 'Váy ẩn riêng tư',
        slug: 'vay-an-rieng-tu',
        status: 'ACTIVE',
        isPublic: false,
        isRentable: true,
      },
    });
    const archivedProd = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('ARCH'),
        name: 'Váy đã lưu trữ',
        slug: 'vay-da-luu-tru',
        status: 'ARCHIVED',
        archivedAt: new Date(),
        isPublic: true,
        isRentable: true,
      },
    });
    const nonRentableProd = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('NORENT'),
        name: 'Váy không cho thuê',
        slug: 'vay-khong-cho-thue',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: false,
      },
    });
    const inactiveProd = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('INACT'),
        name: 'Váy ngừng hoạt động',
        slug: 'vay-ngung-hoat-dong',
        status: 'INACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });
    const otherShopProd = await prisma.product.create({
      data: {
        shopId: otherShop.id,
        categoryId: otherCategory.id,
        code: uniqueCode('OTHER'),
        name: 'Váy của shop khác',
        slug: 'vay-cua-shop-khac',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });

    // 1. Valid public product -> 200 Success
    const validRes = await request(server)
      .get(`/api/v1/web/products/${validProd.slug}`)
      .set('x-shop-code', shop.code)
      .expect(200);

    const validBody = asDetailResponse(validRes);
    expect(validBody.id).toBe(validProd.id);
    expect(validBody.slug).toBe('vay-cong-khai-chuan');
    expect(validBody.name).toBe('Váy công khai');
    expect(validBody.variants).toHaveLength(1);
    const validRaw = validBody as unknown as Record<string, unknown>;
    expect(validRaw).not.toHaveProperty('replacementValue');
    expect(validRaw).not.toHaveProperty('metadata');
    expect(validRaw).not.toHaveProperty('shopId');

    // 2. Private product -> 404 Not Found
    await request(server)
      .get(`/api/v1/web/products/${privateProd.slug}`)
      .set('x-shop-code', shop.code)
      .expect(404)
      .expect((res) => {
        expect(asErrorResponse(res).message).toBe('Không tìm thấy sản phẩm.');
      });

    // 3. Archived product -> 404 Not Found
    await request(server)
      .get(`/api/v1/web/products/${archivedProd.slug}`)
      .set('x-shop-code', shop.code)
      .expect(404)
      .expect((res) => {
        expect(asErrorResponse(res).message).toBe('Không tìm thấy sản phẩm.');
      });

    // 4. Non-rentable product -> 404 Not Found
    await request(server)
      .get(`/api/v1/web/products/${nonRentableProd.slug}`)
      .set('x-shop-code', shop.code)
      .expect(404)
      .expect((res) => {
        expect(asErrorResponse(res).message).toBe('Không tìm thấy sản phẩm.');
      });

    // 5. Inactive status product -> 404 Not Found
    await request(server)
      .get(`/api/v1/web/products/${inactiveProd.slug}`)
      .set('x-shop-code', shop.code)
      .expect(404)
      .expect((res) => {
        expect(asErrorResponse(res).message).toBe('Không tìm thấy sản phẩm.');
      });

    // 6. Other shop product -> 404 Not Found under Shop A scope
    await request(server)
      .get(`/api/v1/web/products/${otherShopProd.slug}`)
      .set('x-shop-code', shop.code)
      .expect(404)
      .expect((res) => {
        expect(asErrorResponse(res).message).toBe('Không tìm thấy sản phẩm.');
      });

    // 7. Non-public product accessed by ID or uppercase code directly -> 404 Not Found
    await request(server)
      .get(`/api/v1/web/products/${privateProd.id}`)
      .set('x-shop-code', shop.code)
      .expect(404);
    await request(server)
      .get(`/api/v1/web/products/${privateProd.code}`)
      .set('x-shop-code', shop.code)
      .expect(404);
  });

  it('guarantees consistency: every fixture excluded from product list is rejected as 404 by detail endpoint', async () => {
    const shop = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);

    const fixtures = [
      {
        name: 'Private Product',
        isPublic: false,
        isRentable: true,
        status: 'ACTIVE',
        archivedAt: null,
      },
      {
        name: 'Archived Product',
        isPublic: true,
        isRentable: true,
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
      {
        name: 'Non-rentable Product',
        isPublic: true,
        isRentable: false,
        status: 'ACTIVE',
        archivedAt: null,
      },
      {
        name: 'Inactive Status Product',
        isPublic: true,
        isRentable: true,
        status: 'INACTIVE',
        archivedAt: null,
      },
      {
        name: 'Private and Inactive Product',
        isPublic: false,
        isRentable: false,
        status: 'INACTIVE',
        archivedAt: new Date(),
      },
    ];

    for (const fixture of fixtures) {
      const code = uniqueCode('CONS');
      const slug = `slug-${code.toLowerCase()}`;
      const product = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          code,
          name: fixture.name,
          slug,
          isPublic: fixture.isPublic,
          isRentable: fixture.isRentable,
          status: fixture.status,
          archivedAt: fixture.archivedAt,
        },
      });

      // 1. Verify excluded from list endpoint
      const listRes = await request(server)
        .get('/api/v1/web/products')
        .set('x-shop-code', shop.code)
        .expect(200);

      const listBody = asListResponse(listRes);
      const listedIds = listBody.items.map((i) => i.id);
      expect(listedIds).not.toContain(product.id);

      // 2. Verify rejected as 404 by detail endpoint (by slug, by code, by id)
      await request(server)
        .get(`/api/v1/web/products/${product.slug}`)
        .set('x-shop-code', shop.code)
        .expect(404);

      await request(server)
        .get(`/api/v1/web/products/${product.code}`)
        .set('x-shop-code', shop.code)
        .expect(404);

      await request(server)
        .get(`/api/v1/web/products/${product.id}`)
        .set('x-shop-code', shop.code)
        .expect(404);
    }
  });

  it('enforces variant visibility: inactive and archived variants are excluded from public responses', async () => {
    const shop = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);
    const sizeM = await prisma.size.create({
      data: { shopId: shop.id, code: uniqueCode('SIZE_M'), name: 'M', sortOrder: 1 },
    });
    const sizeXL = await prisma.size.create({
      data: { shopId: shop.id, code: uniqueCode('SIZE_XL'), name: 'XL', sortOrder: 2 },
    });
    const sizeS = await prisma.size.create({
      data: { shopId: shop.id, code: uniqueCode('SIZE_S'), name: 'S', sortOrder: 0 },
    });
    const colorRed = await prisma.color.create({
      data: { shopId: shop.id, code: uniqueCode('CLR_RED'), name: 'Đỏ', hexColor: '#FF0000' },
    });
    const colorYellow = await prisma.color.create({
      data: { shopId: shop.id, code: uniqueCode('CLR_YEL'), name: 'Vàng', hexColor: '#FFFF00' },
    });
    const colorGreen = await prisma.color.create({
      data: { shopId: shop.id, code: uniqueCode('CLR_GRN'), name: 'Xanh', hexColor: '#00FF00' },
    });

    const product = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('VAR_TEST'),
        name: 'Váy kiểm tra biến thể',
        slug: 'vay-kiem-tra-bien-the',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
        defaultDepositAmount: new Prisma.Decimal(200000),
      },
    });

    // 1. Active variant (should appear)
    const varActive = await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        variantCode: `${product.code}-V_ACT`,
        sizeId: sizeM.id,
        colorId: colorRed.id,
        status: 'ACTIVE',
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        variantId: varActive.id,
        durationDays: 1,
        price: new Prisma.Decimal(100000),
        isActive: true,
      },
    });

    // 2. Inactive variant (status = INACTIVE, should be excluded)
    const varInactive = await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        variantCode: `${product.code}-V_INACT`,
        sizeId: sizeXL.id,
        colorId: colorYellow.id,
        status: 'INACTIVE',
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        variantId: varInactive.id,
        durationDays: 1,
        price: new Prisma.Decimal(99000),
        isActive: true,
      },
    });

    // 3. Archived variant (archivedAt != null, should be excluded)
    const varArchived = await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        variantCode: `${product.code}-V_ARCH`,
        sizeId: sizeS.id,
        colorId: colorGreen.id,
        status: 'ACTIVE',
        archivedAt: new Date(),
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        variantId: varArchived.id,
        durationDays: 1,
        price: new Prisma.Decimal(88000),
        isActive: true,
      },
    });

    // Verify in Product List
    const listRes = await request(server)
      .get('/api/v1/web/products')
      .set('x-shop-code', shop.code)
      .expect(200);

    const listBody = asListResponse(listRes);
    const item = listBody.items.find((i) => i.id === product.id);
    expect(item).toBeDefined();
    if (!item) throw new Error('Expected item to be defined');
    // Size and color summaries must only include the active variant
    expect(item.size).toBe('M');
    expect(item.color).toBe('Đỏ');
    // Rental price must only reflect the active variant (100000, not 99000 or 88000)
    expect(item.rentalPrices).toEqual([{ days: 1, amount: 100000 }]);

    // Filtering by inactive variant's size/color must NOT match this product
    const filterInactiveSize = await request(server)
      .get('/api/v1/web/products?size=XL')
      .set('x-shop-code', shop.code)
      .expect(200);
    expect(asListResponse(filterInactiveSize).items).toHaveLength(0);

    const filterActiveSize = await request(server)
      .get('/api/v1/web/products?size=M')
      .set('x-shop-code', shop.code)
      .expect(200);
    expect(asListResponse(filterActiveSize).items).toHaveLength(1);

    // Verify in Product Detail
    const detailRes = await request(server)
      .get(`/api/v1/web/products/${product.slug}`)
      .set('x-shop-code', shop.code)
      .expect(200);

    const detailBody = asDetailResponse(detailRes);
    expect(detailBody.variants).toHaveLength(1);
    expect(detailBody.variants[0]?.id).toBe(varActive.id);
    expect(detailBody.variants[0]?.code).toBe(`${product.code}-V_ACT`);
    expect(detailBody.size).toBe('M');
    expect(detailBody.color).toBe('Đỏ');
    expect(detailBody.rentalPrices).toEqual([{ days: 1, amount: 100000 }]);
  });
});
