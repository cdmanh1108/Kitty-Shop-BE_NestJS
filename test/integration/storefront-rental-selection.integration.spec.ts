import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { WebRentalService } from '../../src/modules/rentals/application/web-rental.service';
import { RentalInventoryUnavailableError } from '../../src/modules/rentals/domain/rental-errors';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { PrismaSettingsRepository } from '../../src/modules/settings/infrastructure/prisma-settings.repository';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import { uniqueCode } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Storefront rental selection and allocation', () => {
  let prisma: PrismaService;
  let rentals: PrismaRentalRepository;
  let web: WebRentalService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    const settings = new SettingsService(new PrismaSettingsRepository(prisma), {
      log: () => Promise.resolve(),
    });
    rentals = new PrismaRentalRepository(prisma, fixedClock, settings);
    web = new WebRentalService(rentals, settings, new PrismaCustomerRepository(prisma), fixedClock);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  const interval = { pickupDate: '2026-10-10', returnDate: '2026-10-12' };

  function createWebOrderInput(productId: string) {
    return {
      ...interval,
      customer: { name: 'Test Customer', phone: '0912345678' },
      items: [{ productId, quantity: 1 }],
      delivery: { method: 'self_pickup' as const },
      paymentMethod: 'cash' as const,
    };
  }

  it('keeps productId-only compatibility only when exactly one eligible variant exists', async () => {
    const f = await rentalScenario(prisma);

    await expect(
      web.calculateQuote(f.shop.id, {
        ...interval,
        items: [{ productId: f.product.id, quantity: 1 }],
        deliveryMethod: 'self_pickup',
      }),
    ).resolves.toMatchObject({ available: true, rentalSubtotal: 200000 });

    await expect(
      web.createOrder(f.shop.id, createWebOrderInput(f.product.id), 'web-selection-key'),
    ).resolves.toMatchObject({
      status: 'reserved',
    });
  });

  it('does not choose a first variant or aggregate stock for a multi-variant product', async () => {
    const f = await rentalScenario(prisma);
    await prisma.productVariant.create({
      data: {
        shopId: f.shop.id,
        productId: f.product.id,
        variantCode: uniqueCode('SECOND-VARIANT'),
        status: 'ACTIVE',
      },
    });

    await expect(
      web.checkAvailability(f.shop.id, { ...interval, productId: f.product.id }),
    ).resolves.toEqual({ available: false, availableQuantity: 0 });
    await expect(
      web.calculateQuote(f.shop.id, {
        ...interval,
        items: [{ productId: f.product.id, quantity: 1 }],
        deliveryMethod: 'self_pickup',
      }),
    ).resolves.toMatchObject({ available: false, rentalSubtotal: 0 });
    await expect(
      web.createOrder(f.shop.id, createWebOrderInput(f.product.id), 'web-selection-key'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('aggregates duplicate explicit demand before quote and allocation', async () => {
    const f = await rentalScenario(prisma);
    const duplicateItems = [
      { variantId: f.variant.id, quantity: 1 },
      { productId: f.product.id, variantId: f.variant.id, quantity: 1 },
    ];

    await expect(
      web.calculateQuote(f.shop.id, {
        ...interval,
        items: duplicateItems,
        deliveryMethod: 'self_pickup',
      }),
    ).resolves.toMatchObject({ available: false, rentalSubtotal: 400000, depositAmount: 400000 });
    await expect(
      web.createOrder(
        f.shop.id,
        {
          ...createWebOrderInput(f.product.id),
          items: duplicateItems,
        },
        'web-selection-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates one line with distinct inventory allocations for merged demand', async () => {
    const f = await rentalScenario(prisma);
    await prisma.inventoryItem.create({
      data: {
        shopId: f.shop.id,
        variantId: f.variant.id,
        sku: uniqueCode('SKU'),
        barcode: uniqueCode('BARCODE'),
        currentStatus: 'AVAILABLE',
      },
    });

    await web.createOrder(
      f.shop.id,
      {
        ...createWebOrderInput(f.product.id),
        items: [
          { variantId: f.variant.id, quantity: 1 },
          { productId: f.product.id, variantId: f.variant.id, quantity: 1 },
        ],
      },
      'web-selection-key',
    );

    const order = await prisma.rentalOrder.findFirstOrThrow({
      where: { shopId: f.shop.id },
      include: { items: { include: { allocations: true } } },
    });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(2);
    const inventoryIds = order.items[0]?.allocations.map(
      (allocation) => allocation.inventoryItemId,
    );
    expect(new Set(inventoryIds).size).toBe(2);
  });

  it('rejects duplicate physical inventory allocations at the repository boundary', async () => {
    const f = await rentalScenario(prisma);
    const line = f.data.lines[0];
    if (!line) throw new Error('Rental fixture requires a line');

    await expect(
      rentals.createOrder({
        ...f.data,
        lines: [line, { ...line }],
      }),
    ).rejects.toBeInstanceOf(RentalInventoryUnavailableError);
    await expect(prisma.rentalOrder.count({ where: { shopId: f.shop.id } })).resolves.toBe(0);
  });
});
