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
import { SystemClock } from '../../src/common/clock/system-clock';
import { RentalOverlapError } from '../../src/modules/rentals/domain/rental.repository';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

describe('Concurrent Rental Creation & Transaction Rollback Integration', () => {
  let prisma: PrismaService;
  let repo: PrismaRentalRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    repo = new PrismaRentalRepository(prisma, new SystemClock());
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
});
