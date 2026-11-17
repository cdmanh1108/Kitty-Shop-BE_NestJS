import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { RentalCreationService } from '../../src/modules/rentals/application/rental-creation.service';
import { WebRentalOrderService } from '../../src/modules/rentals/application/web-rental-order.service';
import { WebRentalEvaluationService } from '../../src/modules/rentals/application/web-rental-evaluation.service';
import { RENTAL_BILLING_ROLE } from '../../src/modules/rentals/domain/rental-accessories';
import { resolveRentalLinePricing } from '../../src/modules/rentals/domain/rental-pricing-snapshot';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { createTestProductWithVariant, createVerifiedWebAccount } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Two-accessory allowance at rental write boundaries', () => {
  let prisma: PrismaService;
  let rentals: PrismaRentalRepository;
  let admin: RentalCreationService;
  let web: WebRentalOrderService;
  let evaluation: WebRentalEvaluationService;
  const interval = {
    pickupDate: '2026-10-10T08:30:00+07:00',
    returnDate: '2026-10-12T08:30:00+07:00',
  };

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    rentals = new PrismaRentalRepository(prisma, fixedClock, rentalPolicies);
    admin = new RentalCreationService(
      rentals,
      rentals,
      rentals,
      { log: () => Promise.resolve() },
      fixedClock,
      rentalPolicies,
    );
    evaluation = new WebRentalEvaluationService(rentals, rentalPolicies);
    web = new WebRentalOrderService(
      rentals,
      rentals,
      rentalPolicies,
      new PrismaCustomerRepository(prisma),
      fixedClock,
    );
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  async function basket(inventoryCount = 4) {
    const f = await rentalScenario(prisma);
    const accessory = await createTestProductWithVariant(prisma, f.shop.id, { inventoryCount });
    await prisma.product.update({
      where: { id: accessory.product.id },
      data: { allowFreeAccessory: true },
    });
    const items = [
      { variantId: f.variant.id, quantity: 1, billingRole: RENTAL_BILLING_ROLE.PAID },
      {
        variantId: accessory.variant.id,
        quantity: 2,
        billingRole: RENTAL_BILLING_ROLE.FREE_ACCESSORY,
      },
    ];
    return { f, accessory, items };
  }

  it.each(['admin', 'web'] as const)(
    'accepts one paid plus two free through %s without charging the free units',
    async (surface) => {
      const { f, items } = await basket();
      const quote = await evaluation.calculateQuote(f.shop.id, {
        ...interval,
        items,
        deliveryMethod: 'self_pickup',
      });
      expect(quote).toMatchObject({
        available: true,
        rentalSubtotal: 60000,
        depositAmount: 200000,
        accessoryAllowance: {
          billableQuantity: 1,
          freeAccessoryQuantity: 2,
          remainingFreeAccessoryQuantity: 0,
        },
      });
      if (surface === 'admin')
        await admin.create(f.principal, { ...f.input, items }, 'accessory-admin');
      else {
        const account = await createVerifiedWebAccount(prisma);
        await web.createOrder(
          f.shop.id,
          {
            ...interval,
            customer: { name: f.customer.fullName, phone: f.customer.phone },
            items,
            delivery: { method: 'self_pickup' },
            paymentMethod: 'cash',
          },
          'accessory-web',
          { webAccountId: account.id, email: account.email },
        );
      }
      const order = await prisma.rentalOrder.findFirstOrThrow({
        where: { shopId: f.shop.id },
        include: { items: { include: { allocations: true } } },
      });
      expect(order.items).toHaveLength(2);
      const free = order.items.find(
        (item) => item.billingRole === RENTAL_BILLING_ROLE.FREE_ACCESSORY,
      );
      expect(free).toMatchObject({
        quantity: 2,
        allowFreeAccessorySnapshot: true,
        pricingSnapshot: { version: 'FREE_ACCESSORY_V1', billableQuantity: 1 },
      });
      expect(free?.unitRentalPrice.toNumber()).toBe(0);
      expect(free?.depositAmount.toNumber()).toBe(0);
      const allocations = order.items.flatMap((item) => item.allocations);
      expect(allocations).toHaveLength(3);
      expect(new Set(allocations.map((item) => item.inventoryItemId)).size).toBe(3);
    },
  );

  it('rejects three free units consistently in quote, Admin and Web before any booking', async () => {
    const { f, items } = await basket();
    const excessive = items.map((item) => ({
      ...item,
      quantity: item.billingRole === RENTAL_BILLING_ROLE.FREE_ACCESSORY ? 3 : 1,
    }));
    const account = await createVerifiedWebAccount(prisma);
    await expect(
      evaluation.calculateQuote(f.shop.id, {
        ...interval,
        items: excessive,
        deliveryMethod: 'self_pickup',
      }),
    ).rejects.toMatchObject({ code: 'FREE_ACCESSORY_ALLOWANCE_EXCEEDED' });
    await expect(
      admin.create(f.principal, { ...f.input, items: excessive }, 'excess-admin'),
    ).rejects.toMatchObject({ code: 'FREE_ACCESSORY_ALLOWANCE_EXCEEDED' });
    await expect(
      web.createOrder(
        f.shop.id,
        {
          ...interval,
          customer: { name: f.customer.fullName, phone: f.customer.phone },
          items: excessive,
          delivery: { method: 'self_pickup' },
          paymentMethod: 'cash',
        },
        'excess-web',
        { webAccountId: account.id, email: account.email },
      ),
    ).rejects.toMatchObject({ code: 'FREE_ACCESSORY_ALLOWANCE_EXCEEDED' });
    expect(await prisma.rentalOrder.count()).toBe(0);
    expect(await prisma.rentalItemAllocation.count()).toBe(0);
  });

  it('revalidates the allowance inside the booking transaction even for a direct repository caller', async () => {
    const { f, accessory } = await basket();
    const freePricing = resolveRentalLinePricing({
      durationDays: 2,
      billableQuantity: 1,
      quantity: 3,
      depositPerItem: 200000,
      billingRole: RENTAL_BILLING_ROLE.FREE_ACCESSORY,
      policy: (await rentalPolicies.getPolicy(f.shop.id)).rentalPricing,
    });
    await expect(
      rentals.createOrder({
        ...f.data,
        lines: [
          ...f.data.lines,
          {
            ...freePricing,
            productId: accessory.product.id,
            variantId: accessory.variant.id,
            productName: accessory.product.name,
            variantName: accessory.variant.variantCode,
            quantity: 3,
            billingRole: RENTAL_BILLING_ROLE.FREE_ACCESSORY,
            inventory: accessory.inventoryItems
              .slice(0, 3)
              .map((item) => ({ id: item.id, sku: item.sku })),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FREE_ACCESSORY_ALLOWANCE_EXCEEDED' });
    expect(await prisma.rentalOrder.count()).toBe(0);
    expect(await prisma.rentalItemAllocation.count()).toBe(0);
  });

  it('checks the combined paid/free demand against one physical stock pool', async () => {
    const { f, accessory } = await basket(2);
    const items = [
      { variantId: accessory.variant.id, quantity: 1, billingRole: RENTAL_BILLING_ROLE.PAID },
      {
        variantId: accessory.variant.id,
        quantity: 2,
        billingRole: RENTAL_BILLING_ROLE.FREE_ACCESSORY,
      },
    ];
    await expect(
      evaluation.calculateQuote(f.shop.id, { ...interval, items, deliveryMethod: 'self_pickup' }),
    ).resolves.toMatchObject({ available: false });
    await expect(
      admin.create(f.principal, { ...f.input, items }, 'shared-stock'),
    ).rejects.toMatchObject({ kind: 'CONFLICT' });
    expect(await prisma.rentalOrder.count()).toBe(0);
    expect(await prisma.rentalItemAllocation.count()).toBe(0);
  });
});
