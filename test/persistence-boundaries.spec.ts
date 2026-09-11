import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { PrismaRentalRepository } from '../src/modules/rentals/infrastructure/prisma-rental.repository';
import { PrismaCatalogRepository } from '../src/modules/catalog/infrastructure/prisma-catalog.repository';
import {
  toBookableVariant,
  bookableVariantInclude,
} from '../src/modules/rentals/infrastructure/rental-prisma.mapper';
import { availableInventoryWhere } from '../src/modules/catalog/infrastructure/inventory-availability';
import { RentalOverlapError } from '../src/modules/rentals/domain/rental.repository';
import { CatalogInvariantError } from '../src/modules/catalog/domain/catalog.repository';

const now = new Date('2026-09-11T01:30:00Z');
function variant(): NonNullable<Parameters<typeof toBookableVariant>[0]> {
  return {
    id: 'variant',
    shopId: 'shop',
    productId: 'product',
    variantCode: 'BB-01',
    sizeId: null,
    colorId: null,
    depositAmountOverride: null,
    status: 'ACTIVE',
    metadata: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    size: null,
    color: null,
    inventoryItems: [],
    rentalRates: [],
    product: {
      id: 'product',
      shopId: 'shop',
      categoryId: 'category',
      code: 'BB',
      name: 'Ba ba',
      slug: null,
      description: null,
      defaultDepositAmount: new Prisma.Decimal(300000),
      replacementValue: null,
      facebookPostUrl: null,
      currency: 'VND',
      status: 'ACTIVE',
      isRentable: true,
      isPublic: true,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      rentalRates: [
        {
          id: 'rate',
          shopId: 'shop',
          productId: 'product',
          variantId: null,
          durationDays: 1,
          price: new Prisma.Decimal('50000.25'),
          currency: 'VND',
          validFrom: null,
          validUntil: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
  };
}

describe('persistence mapping and availability', () => {
  it('preserves missing variants and missing rate semantics', () => {
    expect(toBookableVariant(null)).toBeNull();
    const record = variant();
    record.product.rentalRates = [];
    expect(toBookableVariant(record)).toMatchObject({
      ratePrice: null,
      sizeName: null,
      colorName: null,
      availableInventory: [],
    });
  });
  it('maps fallback Decimal prices without rounding or mutating the source', () => {
    const record = variant();
    const before = JSON.stringify(record);
    expect(toBookableVariant(record)).toEqual({
      id: 'variant',
      variantCode: 'BB-01',
      productId: 'product',
      productName: 'Ba ba',
      sizeName: null,
      colorName: null,
      depositPerItem: 300000,
      ratePrice: 50000.25,
      availableInventory: [],
    });
    expect(JSON.stringify(record)).toBe(before);
    expect(record.createdAt).toBe(now);
  });
  it('keeps zero overrides and prefers variant rates over product rates', () => {
    const record = variant();
    record.depositAmountOverride = new Prisma.Decimal(0);
    record.rentalRates = record.product.rentalRates.map((rate) => ({
      ...rate,
      variantId: 'variant',
      price: new Prisma.Decimal(0),
    }));
    expect(toBookableVariant(record)).toMatchObject({ depositPerItem: 0, ratePrice: 0 });
  });
  it('uses strict overlap endpoints and blocks only live allocations and unavailable inventory', () => {
    const input = {
      shopId: 'shop',
      variantId: 'variant',
      durationDays: 2,
      from: now,
      until: new Date('2026-09-13T01:30:00Z'),
    };
    const where = availableInventoryWhere(input);
    expect(where.allocations.none).toEqual({
      status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] },
      reservedFrom: { lt: input.until },
      reservedUntil: { gt: input.from },
    });
    expect(where.currentStatus.notIn).toEqual([
      'CLEANING',
      'REPAIRING',
      'DAMAGED',
      'LOST',
      'RETIRED',
    ]);
    expect(where).toMatchObject({ isActive: true, archivedAt: null });
    const include = bookableVariantInclude(input);
    expect(include.inventoryItems.where).toEqual(where);
    expect(include.product.include.rentalRates.where).toEqual({
      variantId: null,
      isActive: true,
      durationDays: 2,
    });
    expect(include.inventoryItems.orderBy).toEqual([{ totalRentalCount: 'asc' }, { sku: 'asc' }]);
  });
});

// Delegate spies only: these tests never connect to a database and do not prove DB rollback.
describe('repository persistence boundaries', () => {
  let prisma: PrismaService;
  beforeEach(() => {
    prisma = new PrismaService();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves tenant-scoped missing product and rental reads', async () => {
    const product = jest.spyOn(prisma.product, 'findFirst').mockResolvedValue(null);
    const order = jest.spyOn(prisma.rentalOrder, 'findFirst').mockResolvedValue(null);
    expect(await new PrismaCatalogRepository(prisma).findProduct('shop', 'missing')).toBeNull();
    expect(
      await new PrismaRentalRepository(prisma, { now: () => new Date() }).get('shop', 'missing'),
    ).toBeNull();
    expect(product.mock.calls[0]?.[0]?.where).toEqual({
      id: 'missing',
      shopId: 'shop',
      archivedAt: null,
    });
    expect(order.mock.calls[0]?.[0]?.where).toEqual({ id: 'missing', shopId: 'shop' });
    expect(order.mock.calls[0]?.[0]?.include).toMatchObject({
      charges: { where: { voidedAt: null } },
      payments: { where: { status: 'COMPLETED', voidedAt: null } },
    });
  });

  it('preserves the catalog detail relation filters and ordering', async () => {
    const find = jest.spyOn(prisma.product, 'findFirst').mockResolvedValue(null);
    await new PrismaCatalogRepository(prisma).findProduct('shop', 'product');
    expect(find.mock.calls[0]?.[0]?.include).toEqual({
      category: true,
      media: { orderBy: { sortOrder: 'asc' } },
      rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
      variants: {
        include: {
          size: true,
          color: true,
          rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
          inventoryItems: { where: { isActive: true }, orderBy: { sku: 'asc' } },
        },
      },
    });
  });

  it('retains serializable isolation and translates exclusion errors for rescheduling', async () => {
    const transaction = jest
      .spyOn(prisma, '$transaction')
      .mockRejectedValue(new Error('rental_item_no_overlap'));
    await expect(
      new PrismaRentalRepository(prisma, { now: () => new Date() }).reschedule({
        shopId: 'shop',
        orderId: 'order',
        from: now,
        until: now,
        changedBy: 'user',
      }),
    ).rejects.toBeInstanceOf(RentalOverlapError);
    expect(transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: 'Serializable' });
  });

  it('propagates unrelated persistence errors unchanged', async () => {
    const failure = new Error('connection unavailable');
    jest.spyOn(prisma, '$transaction').mockRejectedValue(failure);
    await expect(
      new PrismaRentalRepository(prisma, { now: () => new Date() }).reschedule({
        shopId: 'shop',
        orderId: 'order',
        from: now,
        until: now,
        changedBy: 'user',
      }),
    ).rejects.toBe(failure);
  });

  it('rejects a category from another shop before creating it', async () => {
    const lookup = jest.spyOn(prisma.category, 'count').mockResolvedValue(0);
    const create = jest.spyOn(prisma.category, 'create');
    await expect(
      new PrismaCatalogRepository(prisma).createCategory('shop', {
        code: 'BB',
        name: 'Ba ba',
        parentId: 'other',
      }),
    ).rejects.toBeInstanceOf(CatalogInvariantError);
    expect(lookup.mock.calls[0]?.[0]?.where).toEqual({
      id: 'other',
      shopId: 'shop',
      isActive: true,
    });
    expect(create.mock.calls).toHaveLength(0);
  });

  it('uses the supplied transaction for catalog aggregate validation and propagates failure', async () => {
    const tx = new PrismaService();
    const root = jest.spyOn(prisma.category, 'count');
    const lookup = jest.spyOn(tx.category, 'count').mockResolvedValue(0);
    jest.spyOn(prisma, '$transaction').mockImplementation((operation) => operation(tx));
    await expect(
      new PrismaCatalogRepository(prisma).createProduct('shop', {
        code: 'BB',
        name: 'Ba ba',
        categoryId: 'other',
        defaultDepositAmount: 300000,
        isPublic: true,
        variants: [],
        media: [],
      }),
    ).rejects.toBeInstanceOf(CatalogInvariantError);
    expect(root.mock.calls).toHaveLength(0);
    expect(lookup.mock.calls[0]?.[0]?.where).toEqual({
      id: 'other',
      shopId: 'shop',
      isActive: true,
    });
  });

  it('keeps rental creation inside the supplied transaction when a write fails', async () => {
    const tx = new PrismaService();
    const failure = new Error('write failed');
    const root = jest.spyOn(prisma.rentalOrder, 'create');
    const write = jest.spyOn(tx.rentalOrder, 'create').mockRejectedValue(failure);
    const outbox = jest.spyOn(tx.outboxEvent, 'create');
    jest.spyOn(prisma, '$transaction').mockImplementation((operation) => operation(tx));
    await expect(
      new PrismaRentalRepository(prisma, { now: () => new Date() }).createOrder({
        shopId: 'shop',
        customerId: 'customer',
        orderNumber: 'R-01',
        rentalStartAt: now,
        rentalEndAt: now,
        createdBy: 'user',
        discountTotal: 0,
        lines: [],
        charges: [],
      }),
    ).rejects.toBe(failure);
    expect(root.mock.calls).toHaveLength(0);
    expect(write.mock.calls[0]?.[0]?.data).toMatchObject({
      shopId: 'shop',
      status: 'RESERVED',
      paymentStatus: 'PAID',
      depositStatus: 'NOT_REQUIRED',
    });
    expect(outbox.mock.calls).toHaveLength(0);
  });
});
