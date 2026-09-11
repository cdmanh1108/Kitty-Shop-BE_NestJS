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

describe('Rental Availability & Exclusion Constraint Integration', () => {
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

  it('respects half-open intervals [start, end) on PostgreSQL GiST exclusion constraint', async () => {
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

    // Base rental: Sep 10, 2026 00:00 to Sep 12, 2026 00:00 UTC
    const baseStart = new Date('2026-09-10T00:00:00.000Z');
    const baseEnd = new Date('2026-09-12T00:00:00.000Z');

    const baseOrder = await repo.createOrder({
      orderNumber: uniqueCode('RT'),
      shopId: shop.id,
      customerId: customer.id,
      rentalStartAt: baseStart,
      rentalEndAt: baseEnd,
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

    expect(baseOrder).not.toBeNull();
    expect(baseOrder?.id).toBeDefined();

    // 1. New rental Sep 09 -> Sep 10 (immediately preceding, adjacent).
    // In half-open [Sep 09, Sep 10) & [Sep 10, Sep 12), boundary touches but does not overlap!
    const precedingStart = new Date('2026-09-09T00:00:00.000Z');
    const precedingEnd = new Date('2026-09-10T00:00:00.000Z');

    const bookablePreceding = await repo.getBookableVariant({
      shopId: shop.id,
      variantId: variant.id,
      durationDays: 1,
      from: precedingStart,
      until: precedingEnd,
    });
    expect(bookablePreceding?.availableInventory.map((i) => i.id)).toContain(inventoryItem.id);

    const precedingOrder = await repo.createOrder({
      orderNumber: uniqueCode('RT'),
      shopId: shop.id,
      customerId: customer.id,
      rentalStartAt: precedingStart,
      rentalEndAt: precedingEnd,
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
          pricingSnapshot: { durationDays: 1, unitRentalPrice: 100000, depositPerItem: 200000 },
          inventory: [{ id: inventoryItem.id, sku: inventoryItem.sku }],
        },
      ],
      charges: [],
    });
    expect(precedingOrder).not.toBeNull();
    expect(precedingOrder?.id).toBeDefined();

    // 2. New rental Sep 12 -> Sep 13 (immediately succeeding, adjacent).
    // In half-open [Sep 10, Sep 12) & [Sep 12, Sep 13), boundary touches but does not overlap!
    const succeedingStart = new Date('2026-09-12T00:00:00.000Z');
    const succeedingEnd = new Date('2026-09-13T00:00:00.000Z');

    const bookableSucceeding = await repo.getBookableVariant({
      shopId: shop.id,
      variantId: variant.id,
      durationDays: 1,
      from: succeedingStart,
      until: succeedingEnd,
    });
    expect(bookableSucceeding?.availableInventory.map((i) => i.id)).toContain(inventoryItem.id);

    const succeedingOrder = await repo.createOrder({
      orderNumber: uniqueCode('RT'),
      shopId: shop.id,
      customerId: customer.id,
      rentalStartAt: succeedingStart,
      rentalEndAt: succeedingEnd,
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
          pricingSnapshot: { durationDays: 1, unitRentalPrice: 100000, depositPerItem: 200000 },
          inventory: [{ id: inventoryItem.id, sku: inventoryItem.sku }],
        },
      ],
      charges: [],
    });
    expect(succeedingOrder).not.toBeNull();
    expect(succeedingOrder?.id).toBeDefined();

    // 3. New rental Sep 10 -> Sep 11 (overlaps first half of base rental).
    const overlap1Start = new Date('2026-09-10T00:00:00.000Z');
    const overlap1End = new Date('2026-09-11T00:00:00.000Z');

    const bookableOverlap1 = await repo.getBookableVariant({
      shopId: shop.id,
      variantId: variant.id,
      durationDays: 1,
      from: overlap1Start,
      until: overlap1End,
    });
    expect(bookableOverlap1?.availableInventory.map((i) => i.id)).not.toContain(inventoryItem.id);

    await expect(
      repo.createOrder({
        orderNumber: uniqueCode('RT'),
        shopId: shop.id,
        customerId: customer.id,
        rentalStartAt: overlap1Start,
        rentalEndAt: overlap1End,
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
            pricingSnapshot: { durationDays: 1, unitRentalPrice: 100000, depositPerItem: 200000 },
            inventory: [{ id: inventoryItem.id, sku: inventoryItem.sku }],
          },
        ],
        charges: [],
      }),
    ).rejects.toBeInstanceOf(RentalOverlapError);

    // 4. New rental Sep 11 -> Sep 12 (overlaps second half of base rental).
    const overlap2Start = new Date('2026-09-11T00:00:00.000Z');
    const overlap2End = new Date('2026-09-12T00:00:00.000Z');

    const bookableOverlap2 = await repo.getBookableVariant({
      shopId: shop.id,
      variantId: variant.id,
      durationDays: 1,
      from: overlap2Start,
      until: overlap2End,
    });
    expect(bookableOverlap2?.availableInventory.map((i) => i.id)).not.toContain(inventoryItem.id);

    await expect(
      repo.createOrder({
        orderNumber: uniqueCode('RT'),
        shopId: shop.id,
        customerId: customer.id,
        rentalStartAt: overlap2Start,
        rentalEndAt: overlap2End,
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
            pricingSnapshot: { durationDays: 1, unitRentalPrice: 100000, depositPerItem: 200000 },
            inventory: [{ id: inventoryItem.id, sku: inventoryItem.sku }],
          },
        ],
        charges: [],
      }),
    ).rejects.toBeInstanceOf(RentalOverlapError);
  });

  it('reschedules orders safely without false self-overlap, but blocks conflict with other orders', async () => {
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

    // Order 1: Sep 20 -> Sep 22
    const order1 = await repo.createOrder({
      orderNumber: uniqueCode('RT'),
      shopId: shop.id,
      customerId: customer.id,
      rentalStartAt: new Date('2026-09-20T00:00:00.000Z'),
      rentalEndAt: new Date('2026-09-22T00:00:00.000Z'),
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
    expect(order1).not.toBeNull();

    // Order 2: Sep 25 -> Sep 27
    const order2 = await repo.createOrder({
      orderNumber: uniqueCode('RT'),
      shopId: shop.id,
      customerId: customer.id,
      rentalStartAt: new Date('2026-09-25T00:00:00.000Z'),
      rentalEndAt: new Date('2026-09-27T00:00:00.000Z'),
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
    expect(order2).not.toBeNull();

    // Valid reschedule: Order 1 shifts to Sep 22 -> Sep 24 (free window, does not conflict with self or Order 2)
    const rescheduledOrder1 = await repo.reschedule({
      shopId: shop.id,
      orderId: order1!.id,
      from: new Date('2026-09-22T00:00:00.000Z'),
      until: new Date('2026-09-24T00:00:00.000Z'),
      changedBy: member.id,
    });
    expect(rescheduledOrder1).not.toBeNull();
    expect(rescheduledOrder1?.rentalStartAt).toEqual(new Date('2026-09-22T00:00:00.000Z'));
    expect(rescheduledOrder1?.rentalEndAt).toEqual(new Date('2026-09-24T00:00:00.000Z'));

    // Conflicting reschedule: Order 2 attempts to move to Sep 23 -> Sep 25 (overlaps Order 1 on Sep 23-24)
    await expect(
      repo.reschedule({
        shopId: shop.id,
        orderId: order2!.id,
        from: new Date('2026-09-23T00:00:00.000Z'),
        until: new Date('2026-09-25T00:00:00.000Z'),
        changedBy: member.id,
      }),
    ).rejects.toBeInstanceOf(RentalOverlapError);
  });
});
