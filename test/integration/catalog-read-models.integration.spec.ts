import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import {
  connectTestDatabase,
  resetTestDatabase,
  disconnectTestDatabase,
} from '../helpers/test-database';
import {
  createTestShop,
  createTestCategory,
  createTestProductWithVariant,
} from '../fixtures/test-factories';
import { rentalScenario, fixedClock } from '../fixtures/rental.fixture';

describe('Catalog purpose-specific reads', () => {
  let prisma: PrismaService;
  let repo: PrismaCatalogRepository;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    repo = new PrismaCatalogRepository(
      prisma,
      new ConfiguredPublicMediaUrlResolver('https://assets.test.example'),
    );
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  it('counts more than 200 products, paginates projected lists and bounds tenant-scoped searchable lookups', async () => {
    const shop = await createTestShop(prisma);
    const other = await createTestShop(prisma);
    const category = await createTestCategory(prisma, shop.id);
    await prisma.product.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({
        shopId: shop.id,
        categoryId: category.id,
        code: `P-${i}`,
        name: `Dress ${i}`,
        status: i === 204 ? 'INACTIVE' : 'ACTIVE',
      })),
    });
    await createTestProductWithVariant(prisma, other.id);
    const lookups = await repo.listLookups(shop.id);
    expect(lookups.categories[0]?.productCount).toBe(205);
    expect((await repo.listLookups(other.id)).categories[0]?.productCount).toBe(1);
    const priceQuery = jest.spyOn(prisma.rentalRate, 'groupBy');
    const page = await repo.listProducts({ shopId: shop.id, page: 3, limit: 100 });
    expect(priceQuery).toHaveBeenCalledTimes(1);
    priceQuery.mockRestore();
    expect(page.meta).toEqual({ page: 3, limit: 100, total: 205, totalPages: 3 });
    expect(page.items).toHaveLength(5);
    expect(page.items[0]).not.toHaveProperty('variants');
    expect(page.items[0]).not.toHaveProperty('rentalRates');
    expect(page.items[0]).not.toHaveProperty('media');
    expect(page.items[0]?.minPrice).toBeNull();
    const bounded = await repo.lookupProducts({ shopId: shop.id, page: 1, limit: 100 });
    expect(bounded.items).toHaveLength(50);
    expect(bounded.meta.total).toBe(205);
    const found = await repo.lookupProducts({
      shopId: shop.id,
      page: 1,
      limit: 20,
      search: 'p-204',
      status: 'INACTIVE',
    });
    expect(found.items.map((p) => p.code)).toEqual(['P-204']);
    expect(
      (
        await repo.lookupProducts({
          shopId: shop.id,
          page: 1,
          limit: 20,
          search: 'P-204',
          status: 'ACTIVE',
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await repo.lookupProducts({
          shopId: other.id,
          page: 1,
          limit: 20,
          productId: found.items[0]!.id,
        })
      ).items,
    ).toEqual([]);
  });

  it('aggregates active prices including zero and returns only small lookup variants', async () => {
    const shop = await createTestShop(prisma);
    const { product, variant } = await createTestProductWithVariant(prisma, shop.id, {
      dailyRate: 0,
    });
    await prisma.rentalRate.create({
      data: { shopId: shop.id, productId: product.id, durationDays: 10, price: 900 },
    });
    const page = await repo.listProducts({ shopId: shop.id, page: 1, limit: 20 });
    expect(String(page.items[0]?.minPrice)).toBe('0');
    expect(String(page.items[0]?.maxPrice)).toBe('900');
    expect(page.items[0]?.variantCount).toBe(1);
    const lookup = await repo.lookupProducts({ shopId: shop.id, page: 1, limit: 20 });
    expect(lookup.items[0]?.variants).toEqual([
      {
        id: variant.id,
        variantCode: variant.variantCode,
        sizeName: null,
        colorName: null,
        rentalRates: [1, 2, 3, 4, 5].map((durationDays) => ({ durationDays, price: 0 })),
      },
    ]);
    expect(lookup.items[0]).not.toHaveProperty('defaultDepositAmount');
  });

  it('summarizes the entire shop, counts occupied items once and keeps operational status separate', async () => {
    const scenario = await rentalScenario(prisma);
    const rentals = new PrismaRentalRepository(prisma, fixedClock, rentalPolicies);
    await rentals.createOrder(scenario.data);
    await rentals.createOrder({
      ...scenario.data,
      orderNumber: 'SECOND-RESERVATION',
      rentalStartAt: new Date('2026-10-15'),
      rentalEndAt: new Date('2026-10-17'),
    });
    await prisma.rentalItemAllocation.updateMany({
      where: { shopId: scenario.shop.id, reservedFrom: scenario.data.rentalStartAt },
      data: {
        status: 'ACTIVE',
        reservedFrom: new Date('2026-08-01'),
        reservedUntil: new Date('2026-08-02'),
      },
    });
    await prisma.inventoryItem.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({
        shopId: scenario.shop.id,
        variantId: scenario.variant.id,
        sku: `BULK-${i}`,
        currentStatus: i < 5 ? 'CLEANING' : 'AVAILABLE',
      })),
    });
    const other = await createTestShop(prisma);
    await createTestProductWithVariant(prisma, other.id);
    const listQuery = jest.spyOn(prisma.inventoryItem, 'findMany');
    const summary = await repo.inventorySummary(scenario.shop.id);
    expect(listQuery).not.toHaveBeenCalled();
    listQuery.mockRestore();
    expect(summary).toEqual({ total: 206, available: 201, occupied: 1, needsAttention: 5 });
    expect(await repo.inventorySummary(other.id)).toEqual({
      total: 1,
      available: 1,
      occupied: 0,
      needsAttention: 0,
    });
    const list = await repo.listInventory({ shopId: scenario.shop.id, page: 1, limit: 20 });
    expect(list.meta.total).toBe(206);
    expect(list.items).toHaveLength(20);
    expect(list.items[0]).not.toHaveProperty('statusHistory');
    expect(list.items[0]).not.toHaveProperty('allocations');
    expect(list.items[0]?.variant.product).not.toHaveProperty('metadata');
    expect(
      (
        await repo.listInventory({
          shopId: scenario.shop.id,
          page: 1,
          limit: 20,
          productId: scenario.product.id,
          categoryId: (await createTestCategory(prisma, scenario.shop.id)).id,
        })
      ).meta.total,
    ).toBe(0);
  });

  it('returns ordered real history including archived items, with product/item filters and tenant isolation', async () => {
    const shop = await createTestShop(prisma);
    const other = await createTestShop(prisma);
    const { product, inventoryItems } = await createTestProductWithVariant(prisma, shop.id);
    const item = inventoryItems[0]!;
    await prisma.inventoryStatusHistory.createMany({
      data: [
        {
          shopId: shop.id,
          inventoryItemId: item.id,
          fromStatus: 'AVAILABLE',
          toStatus: 'CLEANING',
          reason: 'Wash',
          changedAt: new Date('2026-09-01'),
        },
        {
          shopId: shop.id,
          inventoryItemId: item.id,
          fromStatus: 'CLEANING',
          toStatus: 'AVAILABLE',
          reason: 'Ready',
          changedAt: new Date('2026-09-02'),
        },
      ],
    });
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { archivedAt: new Date('2026-09-03') },
    });
    const history = await repo.inventoryHistory({
      shopId: shop.id,
      productId: product.id,
      page: 1,
      limit: 1,
    });
    expect(history.meta.total).toBe(2);
    expect(history.items[0]).toMatchObject({
      sku: item.sku,
      productName: product.name,
      reason: 'Ready',
    });
    expect(
      (
        await repo.inventoryHistory({
          shopId: shop.id,
          inventoryItemId: item.id,
          page: 2,
          limit: 1,
        })
      ).items[0]?.reason,
    ).toBe('Wash');
    expect(
      (
        await repo.inventoryHistory({
          shopId: other.id,
          inventoryItemId: item.id,
          page: 1,
          limit: 20,
        })
      ).items,
    ).toEqual([]);
  });
});
