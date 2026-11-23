import { checkoutQuoteFixture } from '../fixtures/rental-quote.fixture';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { WebRentalOrderService } from '../../src/modules/rentals/application/web-rental-order.service';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { PrismaSettingsRepository } from '../../src/modules/settings/infrastructure/prisma-settings.repository';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import { createVerifiedWebAccount, uniqueCode } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Web order idempotency', () => {
  let prisma: PrismaService;
  let web: WebRentalOrderService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    const settings = new SettingsService(new PrismaSettingsRepository(prisma), {
      log: () => Promise.resolve(),
    });
    const rentals = new PrismaRentalRepository(prisma, fixedClock, settings);
    web = new WebRentalOrderService(
      rentals,
      rentals,
      settings,
      new PrismaCustomerRepository(prisma),
      fixedClock,
    );
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  const command = (variantId: string, phone: string, note?: string) => ({
    customer: { name: 'Web guest', phone, ...(note ? { note } : {}) },
    pickupDate: '2026-10-10T08:30:00+07:00',
    returnDate: '2026-10-12T08:30:00+07:00',
    items: [{ variantId, quantity: 1 }],
    delivery: { method: 'self_pickup' as const },
    expectedQuote: checkoutQuoteFixture(),
    paymentMethod: 'cash' as const,
  });

  it('stores and replays one Web-safe result without rerunning customer or booking writes', async () => {
    const fixture = await rentalScenario(prisma);
    const account = await createVerifiedWebAccount(prisma);
    const owner = { webAccountId: account.id, email: account.email };
    const key = 'web-replay-key';
    const input = command(fixture.variant.id, fixture.customer.phone);

    const first = await web.createOrder(fixture.shop.id, input, key, owner);
    const replay = await web.createOrder(fixture.shop.id, input, key, owner);

    expect(replay).toEqual(first);
    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(1);
    await expect(
      prisma.rentalItemAllocation.count({ where: { shopId: fixture.shop.id } }),
    ).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(1);
    await expect(prisma.customer.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(1);

    const claim = await prisma.idempotencyRecord.findUniqueOrThrow({
      where: {
        shopId_scope_key: {
          shopId: fixture.shop.id,
          scope: 'web-rental-order.create.v1',
          key,
        },
      },
    });
    expect(claim.responseBody).toEqual({
      version: 1,
      kind: 'web-rental-order-create',
      result: first,
    });
  });

  it('rejects a retained key when the submitted Web command changes', async () => {
    const fixture = await rentalScenario(prisma);
    const account = await createVerifiedWebAccount(prisma);
    const owner = { webAccountId: account.id, email: account.email };
    const key = 'web-mismatch-key';
    await web.createOrder(
      fixture.shop.id,
      command(fixture.variant.id, fixture.customer.phone),
      key,
      owner,
    );

    await expect(
      web.createOrder(
        fixture.shop.id,
        command(fixture.variant.id, fixture.customer.phone, 'Changed'),
        key,
        owner,
      ),
    ).rejects.toMatchObject({ kind: 'CONFLICT' });
    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(1);
  });

  it('permits a distinct key for a distinct booking intent when inventory remains', async () => {
    const fixture = await rentalScenario(prisma);
    const account = await createVerifiedWebAccount(prisma);
    const owner = { webAccountId: account.id, email: account.email };
    await prisma.inventoryItem.create({
      data: {
        shopId: fixture.shop.id,
        variantId: fixture.variant.id,
        sku: uniqueCode('SKU'),
        barcode: uniqueCode('BARCODE'),
        currentStatus: 'AVAILABLE',
      },
    });
    const input = command(fixture.variant.id, fixture.customer.phone);

    await web.createOrder(fixture.shop.id, input, 'web-intent-a', owner);
    await web.createOrder(fixture.shop.id, input, 'web-intent-b', owner);

    await expect(prisma.rentalOrder.count({ where: { shopId: fixture.shop.id } })).resolves.toBe(2);
  });
});
