import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  createTestShop,
  createTestCustomer,
  createTestProductWithVariant,
  createTestUserAndMember,
  uniqueCode,
} from '../fixtures/test-factories';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { PrismaCatalogRepository } from '../../src/modules/catalog/infrastructure/prisma-catalog.repository';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import { RentalOverlapError } from '../../src/modules/rentals/domain/rental.repository';
import { RentalInventoryUnavailableError } from '../../src/modules/rentals/domain/rental-errors';
import { CatalogInvariantError } from '../../src/modules/catalog/domain/catalog.repository';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

describe('Concurrent Rental Creation & Transaction Rollback Integration', () => {
  let prisma: PrismaService;
  let repo: PrismaRentalRepository;
  let catalogRepo: PrismaCatalogRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    repo = new PrismaRentalRepository(prisma, fixedClock);
    catalogRepo = new PrismaCatalogRepository(prisma);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('guarantees at most one conflicting reservation succeeds during concurrent booking race', async () => {
    const shop = await createTestShop(prisma);
    const customer1 = await createTestCustomer(prisma, shop.id);
    const customer2 = await createTestCustomer(prisma, shop.id);
    const { member } = await createTestUserAndMember(prisma, shop.id);
    const { product, variant, inventoryItems } = await createTestProductWithVariant(
      prisma,
      shop.id,
      {
        inventoryCount: 1,
      },
    );
    const inventoryItem = inventoryItems[0]!;

    const start = new Date('2026-10-01T10:00:00.000Z');
    const end = new Date('2026-10-05T10:00:00.000Z');

    const buildBooking = (customerId: string) =>
      repo.createOrder({
        orderNumber: uniqueCode('RT'),
        shopId: shop.id,
        customerId,
        rentalStartAt: start,
        rentalEndAt: end,
        discountTotal: 0,
        createdBy: member.id,
        lines: [
          {
            productId: product.id,
            variantId: variant.id,
            productName: product.name,
            variantName: variant.variantCode,
            quantity: 1,
            unitRentalPrice: 150000,
            depositAmount: 300000,
            lineTotal: 150000,
            pricingSnapshot: { durationDays: 4, unitRentalPrice: 150000, depositPerItem: 300000 },
            inventory: [{ id: inventoryItem.id, sku: inventoryItem.sku }],
          },
        ],
        charges: [],
      });

    // Execute concurrent booking race using Promise.allSettled
    const results = await Promise.allSettled([
      buildBooking(customer1.id),
      buildBooking(customer2.id),
    ]);

    type BookingResult = Awaited<ReturnType<typeof buildBooking>>;
    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<BookingResult> => r.status === 'fulfilled',
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The rejected request must fail with RentalOverlapError
    expect(rejected[0]!.reason).toBeInstanceOf(RentalOverlapError);

    // Verify DB state: exactly 1 order and 1 active allocation created
    const ordersInDb = await prisma.rentalOrder.findMany({ where: { shopId: shop.id } });
    expect(ordersInDb).toHaveLength(1);

    const allocationsInDb = await prisma.rentalItemAllocation.findMany({
      where: { shopId: shop.id, inventoryItemId: inventoryItem.id },
    });
    expect(allocationsInDb).toHaveLength(1);
  });

  it('rolls back all multi-write tables atomically when transaction fails mid-flow', async () => {
    const shop = await createTestShop(prisma);
    const customer = await createTestCustomer(prisma, shop.id);
    const { member } = await createTestUserAndMember(prisma, shop.id);
    const { product, variant, inventoryItems } = await createTestProductWithVariant(
      prisma,
      shop.id,
      {
        inventoryCount: 1,
      },
    );
    const inventoryItem = inventoryItems[0]!;

    // First, create an existing conflicting allocation for the same period
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-11-03T00:00:00.000Z');

    const firstOrder = await repo.createOrder({
      orderNumber: uniqueCode('RT'),
      shopId: shop.id,
      customerId: customer.id,
      rentalStartAt: start,
      rentalEndAt: end,
      discountTotal: 0,
      createdBy: member.id,
      lines: [
        {
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.variantCode,
          quantity: 1,
          unitRentalPrice: 100000,
          depositAmount: 200000,
          lineTotal: 100000,
          pricingSnapshot: { durationDays: 2, unitRentalPrice: 100000, depositPerItem: 200000 },
          inventory: [{ id: inventoryItem.id, sku: inventoryItem.sku }],
        },
      ],
      charges: [],
    });
    expect(firstOrder).not.toBeNull();

    const initialOrderCount = await prisma.rentalOrder.count({ where: { shopId: shop.id } });
    const initialItemCount = await prisma.rentalOrderItem.count({ where: { shopId: shop.id } });
    const initialAllocationCount = await prisma.rentalItemAllocation.count({
      where: { shopId: shop.id },
    });
    const initialOutboxCount = await prisma.outboxEvent.count({ where: { shopId: shop.id } });

    expect(initialOrderCount).toBe(1);
    expect(initialItemCount).toBe(1);
    expect(initialAllocationCount).toBe(1);
    expect(initialOutboxCount).toBe(1);

    // Second booking attempts to allocate the exact same inventory in the same interval.
    // In createOrder, tx creates rentalOrder, then orderItem, then rentalItemAllocation (where exclusion fails).
    // Rollback must ensure rentalOrder and orderItem are NOT committed!
    const conflictingOrderNumber = uniqueCode('RT_CONFLICT');
    await expect(
      repo.createOrder({
        orderNumber: conflictingOrderNumber,
        shopId: shop.id,
        customerId: customer.id,
        rentalStartAt: start,
        rentalEndAt: end,
        discountTotal: 0,
        createdBy: member.id,
        lines: [
          {
            productId: product.id,
            variantId: variant.id,
            productName: product.name,
            variantName: variant.variantCode,
            quantity: 1,
            unitRentalPrice: 100000,
            depositAmount: 200000,
            lineTotal: 100000,
            pricingSnapshot: { durationDays: 2, unitRentalPrice: 100000, depositPerItem: 200000 },
            inventory: [{ id: inventoryItem.id, sku: inventoryItem.sku }],
          },
        ],
        charges: [],
      }),
    ).rejects.toBeInstanceOf(RentalOverlapError);

    // Verify atomic rollback: counts remain exactly as before, no partial state
    expect(await prisma.rentalOrder.count({ where: { shopId: shop.id } })).toBe(initialOrderCount);
    expect(await prisma.rentalOrderItem.count({ where: { shopId: shop.id } })).toBe(
      initialItemCount,
    );
    expect(await prisma.rentalItemAllocation.count({ where: { shopId: shop.id } })).toBe(
      initialAllocationCount,
    );
    expect(await prisma.outboxEvent.count({ where: { shopId: shop.id } })).toBe(initialOutboxCount);

    const abortedOrder = await prisma.rentalOrder.findFirst({
      where: { orderNumber: conflictingOrderNumber },
    });
    expect(abortedOrder).toBeNull();
  });

  it.each(['CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED', 'ARCHIVE'] as const)(
    'serializes booking against warehouse mutation %s',
    async (status) => {
      const f = await rentalScenario(prisma);
      const results = await Promise.allSettled([
        repo.createOrder(f.data),
        status === 'ARCHIVE'
          ? catalogRepo.archiveInventoryItem(f.shop.id, f.inventory.id, 'Audit test', f.member.id)
          : catalogRepo.updateInventoryStatus({
              shopId: f.shop.id,
              id: f.inventory.id,
              status,
              changedBy: f.member.id,
              reason: 'Audit test',
            }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: f.inventory.id } });
      const count = await prisma.rentalItemAllocation.count({
        where: { inventoryItemId: item.id },
      });
      const [booking, mutation] = results;
      if (booking.status === 'fulfilled') {
        expect(booking.value).not.toBeNull();
        expect(mutation.status).toBe('rejected');
        if (mutation.status === 'rejected')
          expect(mutation.reason).toBeInstanceOf(CatalogInvariantError);
        expect(item.currentStatus).toBe('AVAILABLE');
        expect(item.archivedAt).toBeNull();
        expect(count).toBe(1);
      } else {
        expect(booking.reason).toBeInstanceOf(RentalInventoryUnavailableError);
        expect(item.currentStatus).toBe(status === 'ARCHIVE' ? 'RETIRED' : status);
        expect(count).toBe(0);
      }
    },
  );

  it.each(['RESERVED', 'CONFIRMED', 'ACTIVE'] as const)(
    'elapsed dates do not release %s occupancy or permit warehouse mutations',
    async (status) => {
      const f = await rentalScenario(prisma);
      const order = await repo.createOrder({
        ...f.data,
        rentalStartAt: new Date('2000-01-01T00:00:00Z'),
        rentalEndAt: new Date('2000-01-02T00:00:00Z'),
      });
      if (!order) throw new Error('Expected order');
      if (status !== 'RESERVED')
        await repo.transition({
          shopId: f.shop.id,
          orderId: order.id,
          fromStatuses: ['RESERVED'],
          toStatus: status,
          changedBy: f.member.id,
        });
      await expect(
        catalogRepo.updateInventoryStatus({
          shopId: f.shop.id,
          id: f.inventory.id,
          status: 'CLEANING',
          changedBy: f.member.id,
        }),
      ).rejects.toBeInstanceOf(CatalogInvariantError);
      await expect(
        catalogRepo.archiveInventoryItem(f.shop.id, f.inventory.id, 'Audit test', f.member.id),
      ).rejects.toBeInstanceOf(CatalogInvariantError);
      const detail = await catalogRepo.findInventoryItem(f.shop.id, f.inventory.id);
      expect(detail?.occupancyStatus).toBe(status === 'ACTIVE' ? 'RENTED' : 'RESERVED');
      expect(detail?.allowedManualTransitions).toEqual([]);
      if (status === 'ACTIVE') {
        const bookable = await repo.getBookableVariant({
          shopId: f.shop.id,
          variantId: f.variant.id,
          durationDays: 2,
          from: f.data.rentalStartAt,
          until: f.data.rentalEndAt,
        });
        expect(bookable?.availableInventory.map((item) => item.id)).not.toContain(f.inventory.id);
        await expect(
          repo.createOrder({ ...f.data, orderNumber: uniqueCode('RT') }),
        ).rejects.toBeInstanceOf(RentalInventoryUnavailableError);
      }
      expect(
        (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: f.inventory.id } }))
          .currentStatus,
      ).toBe('AVAILABLE');
      expect(await prisma.inventoryStatusHistory.count({ where: { toStatus: 'RENTED' } })).toBe(0);
    },
  );

  it('blocks activation and rescheduling while another non-overlapping rental is unreleased', async () => {
    const f = await rentalScenario(prisma);
    const first = await repo.createOrder(f.data);
    const second = await repo.createOrder({
      ...f.data,
      orderNumber: uniqueCode('RT'),
      rentalStartAt: new Date('2026-11-01T00:00:00Z'),
      rentalEndAt: new Date('2026-11-03T00:00:00Z'),
    });
    if (!first || !second) throw new Error('Expected orders');
    await repo.transition({
      shopId: f.shop.id,
      orderId: first.id,
      fromStatuses: ['RESERVED'],
      toStatus: 'ACTIVE',
      changedBy: f.member.id,
    });
    await expect(
      repo.transition({
        shopId: f.shop.id,
        orderId: second.id,
        fromStatuses: ['RESERVED'],
        toStatus: 'ACTIVE',
        changedBy: f.member.id,
      }),
    ).rejects.toBeInstanceOf(RentalInventoryUnavailableError);
    await expect(
      repo.reschedule({
        shopId: f.shop.id,
        orderId: second.id,
        from: new Date('2026-12-01T00:00:00Z'),
        until: new Date('2026-12-03T00:00:00Z'),
        changedBy: f.member.id,
      }),
    ).rejects.toBeInstanceOf(RentalInventoryUnavailableError);
    expect((await repo.get(f.shop.id, second.id))?.status).toBe('RESERVED');
  });

  it('allows cleaning completion before the next reservation but refuses handover while dirty', async () => {
    const f = await rentalScenario(prisma);
    const first = await repo.createOrder(f.data);
    const next = await repo.createOrder({
      ...f.data,
      orderNumber: uniqueCode('RT'),
      rentalStartAt: new Date('2026-11-01T00:00:00Z'),
      rentalEndAt: new Date('2026-11-03T00:00:00Z'),
    });
    if (!first || !next) throw new Error('Expected orders');
    await repo.transition({
      shopId: f.shop.id,
      orderId: first.id,
      fromStatuses: ['RESERVED'],
      toStatus: 'ACTIVE',
      changedBy: f.member.id,
    });
    await repo.transition({
      shopId: f.shop.id,
      orderId: first.id,
      fromStatuses: ['ACTIVE'],
      toStatus: 'COMPLETED',
      changedBy: f.member.id,
    });
    const activate = {
      shopId: f.shop.id,
      orderId: next.id,
      fromStatuses: ['RESERVED'] as const,
      toStatus: 'ACTIVE' as const,
      changedBy: f.member.id,
    };
    await expect(
      repo.transition({ ...activate, fromStatuses: [...activate.fromStatuses] }),
    ).rejects.toBeInstanceOf(RentalInventoryUnavailableError);
    expect(
      (await catalogRepo.findInventoryItem(f.shop.id, f.inventory.id))?.allowedManualTransitions,
    ).toEqual(['AVAILABLE']);
    await catalogRepo.updateInventoryStatus({
      shopId: f.shop.id,
      id: f.inventory.id,
      status: 'AVAILABLE',
      changedBy: f.member.id,
    });
    expect(
      (await repo.transition({ ...activate, fromStatuses: [...activate.fromStatuses] }))?.status,
    ).toBe('ACTIVE');
  });

  it.each(['RENTED', 'RESERVED'])(
    'database rejects operational occupancy value %s',
    async (status) => {
      const f = await rentalScenario(prisma);
      await expect(
        prisma.$executeRaw`UPDATE inventory_items SET current_status = ${status} WHERE id = ${f.inventory.id}::uuid`,
      ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
    },
  );
});
