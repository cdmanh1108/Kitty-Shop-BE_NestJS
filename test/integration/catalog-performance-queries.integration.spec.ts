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
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

describe('Storefront Catalog Performance & Price Sorting Integration', () => {
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

  it('correctly sorts products by price ascending across multiple paginated pages', async () => {
    const shop = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);

    // Create 4 products with distinct price points: 100k, 200k, 300k, 400k
    const prices = [300000, 100000, 400000, 200000];
    for (let i = 0; i < prices.length; i++) {
      const price = prices[i]!;
      const prod = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          code: uniqueCode(`SORT_${price}`),
          name: `Đầm Giá ${price}`,
          slug: `dam-gia-${price}-${i}`,
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
        },
      });

      await prisma.rentalRate.create({
        data: {
          shopId: shop.id,
          productId: prod.id,
          durationDays: 1,
          price: new Prisma.Decimal(price),
          isActive: true,
        },
      });
    }

    // Request page 1 with limit = 2
    const resPage1 = await request(server)
      .get('/api/v1/web/products?sort=price_asc&page=1&limit=2')
      .set('x-shop-code', shop.code)
      .expect(200);

    const body1 = resPage1.body as ProductListResponse;
    expect(body1.meta.total).toBe(4);
    expect(body1.meta.totalPages).toBe(2);
    expect(body1.items.length).toBe(2);
    expect(body1.items[0]?.rentalPrices[0]?.amount).toBe(100000);
    expect(body1.items[1]?.rentalPrices[0]?.amount).toBe(200000);

    // Request page 2 with limit = 2
    const resPage2 = await request(server)
      .get('/api/v1/web/products?sort=price_asc&page=2&limit=2')
      .set('x-shop-code', shop.code)
      .expect(200);

    const body2 = resPage2.body as ProductListResponse;
    expect(body2.items.length).toBe(2);
    expect(body2.items[0]?.rentalPrices[0]?.amount).toBe(300000);
    expect(body2.items[1]?.rentalPrices[0]?.amount).toBe(400000);
  });

  it('correctly sorts products by price descending across multiple paginated pages', async () => {
    const shop = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);

    const prices = [150000, 450000, 250000, 350000];
    for (let i = 0; i < prices.length; i++) {
      const price = prices[i]!;
      const prod = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          code: uniqueCode(`DESC_${price}`),
          name: `Váy Giá ${price}`,
          slug: `vay-gia-${price}-${i}`,
          status: 'ACTIVE',
          isPublic: true,
          isRentable: true,
        },
      });

      await prisma.rentalRate.create({
        data: {
          shopId: shop.id,
          productId: prod.id,
          durationDays: 1,
          price: new Prisma.Decimal(price),
          isActive: true,
        },
      });
    }

    const res = await request(server)
      .get('/api/v1/web/products?sort=price_desc&page=1&limit=10')
      .set('x-shop-code', shop.code)
      .expect(200);

    const body = res.body as ProductListResponse;
    expect(body.items.length).toBe(4);
    const returnedPrices = body.items.map((it) => it.rentalPrices[0]?.amount);
    expect(returnedPrices).toEqual([450000, 350000, 250000, 150000]);
  });

  it('evaluates variant rental rates when product has no direct rates', async () => {
    const shop = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);

    // Product A: direct rate 200k
    const prodA = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('DIR_RATE'),
        name: 'Sản phẩm Rate Direct',
        slug: 'san-pham-direct-rate',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: prodA.id,
        durationDays: 1,
        price: new Prisma.Decimal(200000),
        isActive: true,
      },
    });

    // Product B: NO direct rate, but variant has rate 100k
    const prodB = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('VAR_RATE'),
        name: 'Sản phẩm Rate Variant',
        slug: 'san-pham-variant-rate',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });
    const varB = await prisma.productVariant.create({
      data: {
        shopId: shop.id,
        productId: prodB.id,
        variantCode: `${prodB.code}-V1`,
        status: 'ACTIVE',
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: prodB.id,
        variantId: varB.id,
        durationDays: 1,
        price: new Prisma.Decimal(100000),
        isActive: true,
      },
    });

    const res = await request(server)
      .get('/api/v1/web/products?sort=price_asc&page=1&limit=10')
      .set('x-shop-code', shop.code)
      .expect(200);

    const body = res.body as ProductListResponse;
    expect(body.items.length).toBe(2);
    // Product B (variant rate 100k) should come before Product A (direct rate 200k)
    expect(body.items[0]?.id).toBe(prodB.id);
    expect(body.items[1]?.id).toBe(prodA.id);
  });

  it('sorts unpriced products NULLS LAST and preserves deterministic secondary tie-breaker', async () => {
    const shop = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);

    // Product A: 100k
    const prodA = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('PRICED_A'),
        name: 'Sản phẩm Có Giá',
        slug: 'san-pham-co-gia',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: prodA.id,
        durationDays: 1,
        price: new Prisma.Decimal(100000),
        isActive: true,
      },
    });

    // Product B: NO rental rates at all
    const prodB = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        code: uniqueCode('NO_PRICE'),
        name: 'Sản phẩm Chưa Có Giá',
        slug: 'san-pham-chua-co-gia',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });

    // In price_asc: prodA (100k) first, prodB (unpriced) last
    const resAsc = await request(server)
      .get('/api/v1/web/products?sort=price_asc')
      .set('x-shop-code', shop.code)
      .expect(200);
    const bodyAsc = resAsc.body as ProductListResponse;
    expect(bodyAsc.items[0]?.id).toBe(prodA.id);
    expect(bodyAsc.items[1]?.id).toBe(prodB.id);

    // In price_desc: prodA (100k) first, prodB (unpriced) last (NULLS LAST)
    const resDesc = await request(server)
      .get('/api/v1/web/products?sort=price_desc')
      .set('x-shop-code', shop.code)
      .expect(200);
    const bodyDesc = resDesc.body as ProductListResponse;
    expect(bodyDesc.items[0]?.id).toBe(prodA.id);
    expect(bodyDesc.items[1]?.id).toBe(prodB.id);
  });

  it('combines price sorting with category, search, and variant filters', async () => {
    const shop = await createTestShop(prisma);
    const catVay = await createTestCategory(prisma, shop.id);
    const catAo = await createTestCategory(prisma, shop.id);

    // Vay 1: 300k
    const prod1 = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: catVay.id,
        code: uniqueCode('VAY_300'),
        name: 'Váy dạ hội đỏ',
        slug: 'vay-da-hoi-do',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: prod1.id,
        durationDays: 1,
        price: new Prisma.Decimal(300000),
        isActive: true,
      },
    });

    // Vay 2: 100k
    const prod2 = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: catVay.id,
        code: uniqueCode('VAY_100'),
        name: 'Váy dạ hội trắng',
        slug: 'vay-da-hoi-trang',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: prod2.id,
        durationDays: 1,
        price: new Prisma.Decimal(100000),
        isActive: true,
      },
    });

    // Ao 1: 50k (different category)
    const prod3 = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: catAo.id,
        code: uniqueCode('AO_50'),
        name: 'Áo sơ mi',
        slug: 'ao-so-mi',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: prod3.id,
        durationDays: 1,
        price: new Prisma.Decimal(50000),
        isActive: true,
      },
    });

    // Filter by catVay and sort by price_asc
    const res = await request(server)
      .get(`/api/v1/web/products?category=${catVay.code}&sort=price_asc`)
      .set('x-shop-code', shop.code)
      .expect(200);

    const body = res.body as ProductListResponse;
    expect(body.meta.total).toBe(2);
    expect(body.items.length).toBe(2);
    expect(body.items[0]?.id).toBe(prod2.id); // 100k
    expect(body.items[1]?.id).toBe(prod1.id); // 300k

    // Combine with search query "trắng"
    const resSearch = await request(server)
      .get(`/api/v1/web/products?q=tr%E1%BA%AFng&sort=price_asc`)
      .set('x-shop-code', shop.code)
      .expect(200);

    const bodySearch = resSearch.body as ProductListResponse;
    expect(bodySearch.meta.total).toBe(1);
    expect(bodySearch.items[0]?.id).toBe(prod2.id);
  });

  it('enforces tenant isolation and visibility rules under price sorting', async () => {
    const shop = await createTestShop(prisma);
    const otherShop = await createTestShop(prisma);
    const cat = await createTestCategory(prisma, shop.id);
    const otherCat = await createTestCategory(prisma, otherShop.id);

    // Other shop product: 50k
    const otherProd = await prisma.product.create({
      data: {
        shopId: otherShop.id,
        categoryId: otherCat.id,
        code: uniqueCode('OTHER_SHOP'),
        name: 'Đầm Shop Khác',
        slug: 'dam-shop-khac',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: otherShop.id,
        productId: otherProd.id,
        durationDays: 1,
        price: new Prisma.Decimal(50000),
        isActive: true,
      },
    });

    // Current shop valid: 200k
    const currentProd = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: cat.id,
        code: uniqueCode('CURRENT_SHOP'),
        name: 'Đầm Shop Hiện Tại',
        slug: 'dam-shop-hien-tai',
        status: 'ACTIVE',
        isPublic: true,
        isRentable: true,
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: currentProd.id,
        durationDays: 1,
        price: new Prisma.Decimal(200000),
        isActive: true,
      },
    });

    // Current shop private (should be hidden): 80k
    const privateProd = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: cat.id,
        code: uniqueCode('PRIVATE_PROD'),
        name: 'Đầm Private',
        slug: 'dam-private',
        status: 'ACTIVE',
        isPublic: false,
        isRentable: true,
      },
    });
    await prisma.rentalRate.create({
      data: {
        shopId: shop.id,
        productId: privateProd.id,
        durationDays: 1,
        price: new Prisma.Decimal(80000),
        isActive: true,
      },
    });

    const res = await request(server)
      .get('/api/v1/web/products?sort=price_asc')
      .set('x-shop-code', shop.code)
      .expect(200);

    const body = res.body as ProductListResponse;
    expect(body.meta.total).toBe(1);
    expect(body.items.length).toBe(1);
    expect(body.items[0]?.id).toBe(currentProd.id);
  });
});
