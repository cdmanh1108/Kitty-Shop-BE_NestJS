import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { WebRentalService } from '../../src/modules/rentals/application/web-rental.service';
import { RentalInventoryUnavailableError } from '../../src/modules/rentals/domain/rental-errors';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { PrismaSettingsRepository } from '../../src/modules/settings/infrastructure/prisma-settings.repository';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Storefront rental eligibility boundary', () => {
  let prisma: PrismaService;
  let rentals: PrismaRentalRepository;
  let web: WebRentalService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    const settings = new SettingsService(new PrismaSettingsRepository(prisma), {
      log: () => Promise.resolve(),
    });
    rentals = new PrismaRentalRepository(prisma, fixedClock, settings);
    web = new WebRentalService(rentals, settings, new PrismaCustomerRepository(prisma));
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  const interval = { pickupDate: '2026-10-10', returnDate: '2026-10-12' };

  it('does not expose a private but otherwise rentable variant through availability, quote, or create', async () => {
    const f = await rentalScenario(prisma);
    await prisma.product.update({ where: { id: f.product.id }, data: { isPublic: false } });

    await expect(
      web.checkAvailability(f.shop.id, { ...interval, variantId: f.variant.id }),
    ).resolves.toEqual({ available: false, availableQuantity: 0 });
    await expect(
      web.checkAvailability(f.shop.id, { ...interval, productId: f.product.id }),
    ).resolves.toEqual({ available: false, availableQuantity: 0 });
    await expect(
      web.calculateQuote(f.shop.id, {
        ...interval,
        items: [{ variantId: f.variant.id, quantity: 1 }],
        deliveryMethod: 'self_pickup',
      }),
    ).resolves.toMatchObject({ available: false, rentalSubtotal: 0, depositAmount: 0 });

    await expect(
      web.createOrder(f.shop.id, {
        ...interval,
        customer: { name: f.customer.fullName, phone: f.customer.phone },
        items: [{ variantId: f.variant.id, quantity: 1 }],
        delivery: { method: 'self_pickup' },
        paymentMethod: 'cash',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.rentalOrder.count({ where: { shopId: f.shop.id } })).toBe(0);
  });

  it('rechecks a product made private after storefront resolution before any booking write', async () => {
    const f = await rentalScenario(prisma);
    const input = { ...f.data, storefrontEligibility: true as const };
    await prisma.product.update({ where: { id: f.product.id }, data: { isPublic: false } });

    await expect(rentals.createOrder(input)).rejects.toBeInstanceOf(
      RentalInventoryUnavailableError,
    );
    await expect(prisma.rentalOrder.count({ where: { shopId: f.shop.id } })).resolves.toBe(0);
    await expect(prisma.rentalItemAllocation.count({ where: { shopId: f.shop.id } })).resolves.toBe(
      0,
    );
    await expect(prisma.rentalOrderCharge.count({ where: { shopId: f.shop.id } })).resolves.toBe(0);
    await expect(prisma.outboxEvent.count({ where: { shopId: f.shop.id } })).resolves.toBe(0);
  });

  it('rejects a storefront line whose productId does not own the selected variant', async () => {
    const f = await rentalScenario(prisma);
    const other = await rentalScenario(prisma);
    const input = {
      ...f.data,
      storefrontEligibility: true as const,
      lines: f.data.lines.map((line) => ({ ...line, productId: other.product.id })),
    };

    await expect(rentals.createOrder(input)).rejects.toBeInstanceOf(
      RentalInventoryUnavailableError,
    );
    expect(await prisma.rentalOrder.count({ where: { shopId: f.shop.id } })).toBe(0);
  });

  it('keeps Admin rental creation available for an operationally rentable private product', async () => {
    const f = await rentalScenario(prisma);
    await prisma.product.update({ where: { id: f.product.id }, data: { isPublic: false } });

    const order = await rentals.createOrder(f.data);
    expect(order).not.toBeNull();
    expect(order?.items).toHaveLength(1);
  });
});
