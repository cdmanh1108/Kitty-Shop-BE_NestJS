import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { rentalScenario, fixedClock } from '../fixtures/rental.fixture';
import { createTestShop, uniqueCode } from '../fixtures/test-factories';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { CatalogInvariantError } from '../../src/modules/catalog/domain/catalog.repository';
import { RentalInventoryUnavailableError } from '../../src/modules/rentals/domain/rental-errors';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

describe('Catalog persistence invariants', () => {
  let prisma: PrismaService;
  let catalog: PrismaCatalogRepository;
  let rentals: PrismaRentalRepository;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    catalog = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.test.example'),
    );
    rentals = new PrismaRentalRepository(prisma, fixedClock);
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  it.each(['RESERVED', 'CONFIRMED', 'ACTIVE'] as const)(
    'unreleased %s protects archives even after planned end',
    async (status) => {
      const f = await rentalScenario(prisma);
      const order = await rentals.createOrder({
        ...f.data,
        rentalStartAt: new Date('2000-01-01T00:00:00Z'),
        rentalEndAt: new Date('2000-01-02T00:00:00Z'),
      });
      if (!order) throw new Error('Expected order');
      if (status !== 'RESERVED')
        await rentals.transition({
          shopId: f.shop.id,
          orderId: order.id,
          fromStatuses: ['RESERVED'],
          toStatus: status,
          changedBy: f.member.id,
        });
      await expect(catalog.archiveProduct(f.shop.id, f.product.id)).rejects.toBeInstanceOf(
        CatalogInvariantError,
      );
      await expect(
        catalog.updateProduct(f.shop.id, f.product.id, { status: 'ARCHIVED' }),
      ).rejects.toBeInstanceOf(CatalogInvariantError);
      await expect(
        catalog.archiveInventoryItem(f.shop.id, f.inventory.id, 'Audit', f.member.id),
      ).rejects.toBeInstanceOf(CatalogInvariantError);
      expect(
        (await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).archivedAt,
      ).toBeNull();
      expect(
        (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: f.inventory.id } }))
          .archivedAt,
      ).toBeNull();
    },
  );

  it.each(['CANCELLED', 'COMPLETED'] as const)(
    'allows archive after %s releases occupancy',
    async (status) => {
      const f = await rentalScenario(prisma);
      const order = await rentals.createOrder(f.data);
      if (!order) throw new Error('Expected order');
      if (status === 'COMPLETED')
        await rentals.transition({
          shopId: f.shop.id,
          orderId: order.id,
          fromStatuses: ['RESERVED'],
          toStatus: 'ACTIVE',
          changedBy: f.member.id,
        });
      await rentals.transition({
        shopId: f.shop.id,
        orderId: order.id,
        fromStatuses: ['RESERVED', 'ACTIVE'],
        toStatus: status,
        changedBy: f.member.id,
      });
      expect(
        await catalog.archiveInventoryItem(f.shop.id, f.inventory.id, 'Audit', f.member.id),
      ).toBe(true);
      expect(await catalog.archiveProduct(f.shop.id, f.product.id)).toBe(true);
      expect(await prisma.rentalItemAllocation.count({ where: { orderId: order.id } })).toBe(1);
    },
  );

  it.each(['product', 'inventory'] as const)(
    'booking versus %s archive has exactly one winner',
    async (target) => {
      const f = await rentalScenario(prisma);
      const [booking, archive] = await Promise.allSettled([
        rentals.createOrder(f.data),
        target === 'product'
          ? catalog.archiveProduct(f.shop.id, f.product.id)
          : catalog.archiveInventoryItem(f.shop.id, f.inventory.id, 'Audit', f.member.id),
      ]);
      expect([booking, archive].filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const item =
        target === 'product'
          ? await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })
          : await prisma.inventoryItem.findUniqueOrThrow({ where: { id: f.inventory.id } });
      const count = await prisma.rentalItemAllocation.count({
        where: { inventoryItemId: f.inventory.id },
      });
      if (archive.status === 'fulfilled') {
        expect(archive.value).toBe(true);
        expect(item.archivedAt).not.toBeNull();
        expect(count).toBe(0);
        if (booking.status === 'rejected')
          expect(booking.reason).toBeInstanceOf(RentalInventoryUnavailableError);
      } else {
        expect(archive.reason).toBeInstanceOf(CatalogInvariantError);
        expect(item.archivedAt).toBeNull();
        expect(count).toBe(1);
      }
    },
  );

  it('rejects stale booking candidates and rate writes after product archive', async () => {
    const f = await rentalScenario(prisma);
    expect(await catalog.archiveProduct(f.shop.id, f.product.id)).toBe(true);
    await expect(rentals.createOrder(f.data)).rejects.toBeInstanceOf(
      RentalInventoryUnavailableError,
    );
    expect(await prisma.rentalOrder.count()).toBe(0);
    expect(
      await catalog.upsertRentalRate(f.shop.id, f.variant.id, { durationDays: 9, price: 10 }),
    ).toBeNull();
  });

  it('rejects cross-shop archive and rate mutations', async () => {
    const f = await rentalScenario(prisma);
    const other = await createTestShop(prisma);
    expect(await catalog.archiveProduct(other.id, f.product.id)).toBe(false);
    expect(await catalog.archiveInventoryItem(other.id, f.inventory.id)).toBe(false);
    expect(
      await catalog.upsertRentalRate(other.id, f.variant.id, { durationDays: 9, price: 10 }),
    ).toBeNull();
  });

  it.each([3, 9])(
    'concurrent rate upserts for duration %s both succeed with one active row',
    async (durationDays) => {
      const f = await rentalScenario(prisma);
      const results = await Promise.all(
        [100000, 120000].map((price) =>
          catalog.upsertRentalRate(f.shop.id, f.variant.id, { durationDays, price }),
        ),
      );
      expect(results[0]?.id).toBe(results[1]?.id);
      const rates = await prisma.rentalRate.findMany({
        where: { variantId: f.variant.id, durationDays, isActive: true },
      });
      expect(rates).toHaveLength(1);
      expect([100000, 120000]).toContain(Number(rates[0]?.price));
    },
  );

  it.each([false, true])(
    'DB protects active rate scope (product-level=%s) while preserving inactive history',
    async (productLevel) => {
      const f = await rentalScenario(prisma);
      const data = {
        shopId: f.shop.id,
        productId: f.product.id,
        variantId: productLevel ? null : f.variant.id,
        durationDays: 9,
        price: 100000,
      };
      await prisma.rentalRate.create({ data });
      await expect(prisma.rentalRate.create({ data })).rejects.toMatchObject({ code: 'P2002' });
      await prisma.rentalRate.createMany({
        data: [
          { ...data, isActive: false },
          { ...data, isActive: false },
        ],
      });
      expect(await prisma.rentalRate.count({ where: { ...data, isActive: false } })).toBe(2);
      await prisma.rentalRate.create({ data: { ...data, durationDays: 10 } });
    },
  );

  it('variant pricing overrides the product fallback; other variants keep independent prices', async () => {
    const f = await rentalScenario(prisma);
    const size = await prisma.size.create({
      data: { shopId: f.shop.id, code: uniqueCode('SIZE'), name: 'Other' },
    });
    const other = await catalog.addVariant(f.shop.id, f.product.id, {
      variantCode: uniqueCode('V'),
      sizeId: size.id,
      inventoryCount: 0,
      rentalRates: [],
    });
    if (!other) throw new Error('Expected variant');
    await prisma.rentalRate.create({
      data: { shopId: f.shop.id, productId: f.product.id, durationDays: 9, price: 50000 },
    });
    const query = {
      shopId: f.shop.id,
      durationDays: 9,
      from: f.data.rentalStartAt,
      until: f.data.rentalEndAt,
    };
    expect(
      (await rentals.getBookableVariant({ ...query, variantId: f.variant.id }))?.ratePrice,
    ).toBe(50000);
    await catalog.upsertRentalRate(f.shop.id, f.variant.id, { durationDays: 9, price: 70000 });
    await catalog.upsertRentalRate(f.shop.id, other.id, { durationDays: 9, price: 80000 });
    expect(
      (await rentals.getBookableVariant({ ...query, variantId: f.variant.id }))?.ratePrice,
    ).toBe(70000);
    expect((await rentals.getBookableVariant({ ...query, variantId: other.id }))?.ratePrice).toBe(
      80000,
    );
  });

  it('DB protects nullable variant combinations while allowing archived history', async () => {
    const f = await rentalScenario(prisma);
    const data = { shopId: f.shop.id, productId: f.product.id, variantCode: uniqueCode('V') };
    await expect(prisma.productVariant.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.productVariant.create({ data: { ...data, archivedAt: fixedClock.now() } });
  });

  it('concurrent variant additions cannot duplicate size/color', async () => {
    const f = await rentalScenario(prisma);
    const size = await prisma.size.create({
      data: { shopId: f.shop.id, code: uniqueCode('SIZE'), name: 'Other' },
    });
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        catalog.addVariant(f.shop.id, f.product.id, {
          variantCode: uniqueCode('V'),
          sizeId: size.id,
          inventoryCount: 0,
          rentalRates: [],
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.productVariant.count({ where: { productId: f.product.id, sizeId: size.id } }),
    ).toBe(1);
  });

  it('DB and concurrent media writes preserve one primary image', async () => {
    const f = await rentalScenario(prisma);
    const data = {
      shopId: f.shop.id,
      productId: f.product.id,
      url: 'https://example.com/one.jpg',
      isPrimary: true,
    };
    await prisma.productMedia.create({ data });
    await expect(prisma.productMedia.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    const results = await Promise.allSettled(
      [1, 2].map((id) =>
        catalog.addProductMedia(f.shop.id, f.product.id, {
          url: `https://example.com/${id}.jpg`,
          isPrimary: true,
          sortOrder: id,
        }),
      ),
    );
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(
      await prisma.productMedia.count({ where: { productId: f.product.id, isPrimary: true } }),
    ).toBe(1);
  });

  const migrationPath =
    'prisma/migrations/202609110004_harden_rental_rate_and_media_uniqueness/migration.sql';
  const indexes = [
    'rental_rates_variant_active_unique',
    'rental_rates_product_active_unique',
    'product_variants_unarchived_combination_unique',
    'product_media_product_id_primary_unique',
  ];
  it.each(['none', 'variant-rate', 'product-rate', 'variant', 'media'] as const)(
    'migration from prior schema is atomic, duplicate scope=%s',
    async (duplicate) => {
      const f = await rentalScenario(prisma);
      const rollback = new Error('Rollback migration verification');
      const operation = prisma.$transaction(async (tx) => {
        for (const name of indexes) await tx.$executeRawUnsafe(`DROP INDEX "${name}"`);
        if (duplicate === 'variant-rate')
          await tx.rentalRate.create({
            data: {
              shopId: f.shop.id,
              productId: f.product.id,
              variantId: f.variant.id,
              durationDays: 1,
              price: 123,
            },
          });
        if (duplicate === 'product-rate') {
          await tx.rentalRate.createMany({
            data: [1, 2].map((price) => ({
              shopId: f.shop.id,
              productId: f.product.id,
              durationDays: 9,
              price,
            })),
          });
        }
        if (duplicate === 'variant') {
          await tx.productVariant.create({
            data: {
              shopId: f.shop.id,
              productId: f.product.id,
              variantCode: uniqueCode('DUP'),
            },
          });
        }
        if (duplicate === 'media') {
          await tx.productMedia.createMany({
            data: [1, 2].map((id) => ({
              shopId: f.shop.id,
              productId: f.product.id,
              url: `https://example.com/${id}.jpg`,
              isPrimary: true,
            })),
          });
        }
        for (const statement of readFileSync(join(process.cwd(), migrationPath), 'utf8').split(
          '-- statement-breakpoint',
        )) {
          if (!['BEGIN;', 'COMMIT;'].includes(statement.trim()))
            await tx.$executeRawUnsafe(statement);
        }
        expect(await tx.rentalRate.count({ where: { variantId: f.variant.id } })).toBe(5);
        throw rollback;
      });
      if (duplicate !== 'none')
        await expect(operation).rejects.toMatchObject({ code: 'P2010', meta: { code: 'P0001' } });
      else await expect(operation).rejects.toBe(rollback);
      expect(await prisma.rentalRate.count({ where: { variantId: f.variant.id } })).toBe(5);
    },
  );
});
