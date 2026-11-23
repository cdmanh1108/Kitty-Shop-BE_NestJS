import { quoteAmounts } from '../fixtures/rental-quote.fixture';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { WebRentalOrderService } from '../../src/modules/rentals/application/web-rental-order.service';
import { WebRentalEvaluationService } from '../../src/modules/rentals/application/web-rental-evaluation.service';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { PrismaSettingsRepository } from '../../src/modules/settings/infrastructure/prisma-settings.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import {
  createVerifiedWebAccount,
  createTestCustomer,
  createTestProductWithVariant,
  createTestShop,
} from '../fixtures/test-factories';

describe('Web rental shipping persistence', () => {
  let prisma: PrismaService;
  let settings: SettingsService;
  let rentals: PrismaRentalRepository;
  let web: WebRentalOrderService;
  let evaluation: WebRentalEvaluationService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    settings = new SettingsService(new PrismaSettingsRepository(prisma), {
      log: () => Promise.resolve(),
    });
    rentals = new PrismaRentalRepository(prisma, fixedClock, settings);
    evaluation = new WebRentalEvaluationService(rentals, settings);
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

  async function setup(input: { inventoryCount?: number }) {
    const shop = await createTestShop(prisma);
    const customer = await createTestCustomer(prisma, shop.id);
    const catalog = await createTestProductWithVariant(prisma, shop.id, {
      depositAmount: 200000,
      inventoryCount: input.inventoryCount ?? 1,
    });
    return { shop, customer, catalog };
  }

  async function quoteAndCreate(input: {
    shopId: string;
    customer: { fullName: string; phone: string };
    variantId: string;
    quantity?: number;
    delivery: 'shop_delivery' | 'self_pickup';
  }) {
    const quantity = input.quantity ?? 1;
    const account = await createVerifiedWebAccount(prisma);
    const quoteRequest = {
      pickupDate: '2026-10-10T08:30:00+07:00',
      returnDate: '2026-10-13T08:30:00+07:00',
      items: [{ variantId: input.variantId, quantity }],
      deliveryMethod: input.delivery,
    };
    const quote = await evaluation.calculateQuote(input.shopId, quoteRequest);
    const response = await web.createOrder(
      input.shopId,
      {
        customer: { name: input.customer.fullName, phone: input.customer.phone },
        pickupDate: quoteRequest.pickupDate,
        returnDate: quoteRequest.returnDate,
        items: quoteRequest.items,
        delivery: {
          method: input.delivery,
          ...(input.delivery === 'shop_delivery' ? { address: '1 Nguyễn Huệ' } : {}),
        },
        expectedQuote: quoteAmounts(quote),
        paymentMethod: 'cash',
      },
      'web-shipping-key',
      { webAccountId: account.id, email: account.email },
    );
    const order = await prisma.rentalOrder.findFirstOrThrow({
      where: { shopId: input.shopId, orderNumber: response.orderCode },
      include: { charges: true, deliveries: true, items: { include: { allocations: true } } },
    });
    return { quote, response, order };
  }

  it('records the fixed shipping fee once across quote, Web create response, and PostgreSQL', async () => {
    const { shop, customer, catalog } = await setup({});
    const { quote, response, order } = await quoteAndCreate({
      shopId: shop.id,
      customer,
      variantId: catalog.variant.id,
      delivery: 'shop_delivery',
    });

    expect(quote).toMatchObject({
      rentalSubtotal: 70000,
      shippingFee: 30000,
      totalAmount: 100000,
    });
    expect(response.totalAmount).toBe(100000);
    expect(order.rentalSubtotal.toString()).toBe('70000');
    expect(order.chargesTotal.toString()).toBe('30000');
    expect(order.grandTotal.toString()).toBe('100000');
    expect(order.charges).toHaveLength(1);
    expect(order.charges[0]).toMatchObject({ chargeType: 'SHIPPING', quantity: 1 });
    expect(order.charges[0]?.amount.toString()).toBe('30000');
    expect(order.deliveries).toHaveLength(1);
    expect(order.deliveries[0]).toMatchObject({ direction: 'OUTBOUND', method: 'DELIVERY' });
    expect(order.deliveries[0]?.shippingFee.toString()).toBe('30000');
  });

  it('does not charge the fixed shipping fee for self pickup', async () => {
    const { shop, customer, catalog } = await setup({});
    const { quote, response, order } = await quoteAndCreate({
      shopId: shop.id,
      customer,
      variantId: catalog.variant.id,
      delivery: 'self_pickup',
    });

    expect(quote).toMatchObject({ rentalSubtotal: 70000, shippingFee: 0, totalAmount: 70000 });
    expect(response.totalAmount).toBe(70000);
    expect(order.charges).toEqual([]);
    expect(order.chargesTotal.toString()).toBe('0');
    expect(order.deliveries[0]).toMatchObject({ method: 'PICKUP' });
    expect(order.deliveries[0]?.shippingFee.toString()).toBe('0');
  });

  it('charges shipping once for a multi-unit Web line and preserves all allocations', async () => {
    const { shop, customer, catalog } = await setup({ inventoryCount: 2 });
    const { quote, response, order } = await quoteAndCreate({
      shopId: shop.id,
      customer,
      variantId: catalog.variant.id,
      quantity: 2,
      delivery: 'shop_delivery',
    });

    expect(quote).toMatchObject({
      rentalSubtotal: 140000,
      shippingFee: 30000,
      totalAmount: 170000,
    });
    expect(response.totalAmount).toBe(170000);
    expect(order.grandTotal.toString()).toBe('170000');
    expect(order.charges).toHaveLength(1);
    expect(order.charges[0]).toMatchObject({ chargeType: 'SHIPPING', quantity: 1 });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ quantity: 2 });
    expect(order.items[0]?.allocations).toHaveLength(2);
  });

  it('rejects a deposit changed after checkout preflight and accepts the next reviewed quote', async () => {
    const { shop, customer, catalog } = await setup({});
    const createOrder = rentals.createOrder.bind(rentals);
    const beforeBooking = jest
      .spyOn(rentals, 'createOrder')
      .mockImplementationOnce(async (data) => {
        await prisma.productVariant.update({
          where: { id: catalog.variant.id },
          data: { depositAmountOverride: 250_000 },
        });
        return createOrder(data);
      });
    const booking = {
      shopId: shop.id,
      customer,
      variantId: catalog.variant.id,
      delivery: 'shop_delivery' as const,
    };
    try {
      await expect(quoteAndCreate(booking)).rejects.toMatchObject({ code: 'RENTAL_QUOTE_CHANGED' });
      expect(await prisma.rentalOrder.count()).toBe(0);
      expect(await prisma.rentalItemAllocation.count()).toBe(0);
      expect(await prisma.deliveryJob.count()).toBe(0);
    } finally {
      beforeBooking.mockRestore();
    }
    const { quote, response, order } = await quoteAndCreate(booking);
    expect(quote.depositAmount).toBe(250_000);
    expect(response.depositAmount).toBe(250_000);
    expect(order.depositRequired.toNumber()).toBe(250_000);
  });

  it('keeps independent explicit charges separate from delivery-owned shipping in booking', async () => {
    const scenario = await rentalScenario(prisma);
    const order = await rentals.createOrder({
      ...scenario.data,
      discountTotal: 10000,
      charges: [
        { chargeType: 'DAMAGE', amount: 20000, quantity: 2, description: 'Independent fee' },
      ],
      delivery: { direction: 'OUTBOUND', method: 'DELIVERY', shippingFee: 30000 },
    });
    if (!order) throw new Error('Expected rental order');
    const persisted = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { charges: { orderBy: { chargeType: 'asc' } }, deliveries: true },
    });

    expect(persisted.chargesTotal.toString()).toBe('70000');
    expect(persisted.grandTotal.toString()).toBe('260000');
    expect(
      persisted.charges.map((charge) => [
        charge.chargeType,
        charge.amount.toString(),
        charge.quantity,
      ]),
    ).toEqual([
      ['DAMAGE', '20000', 2],
      ['SHIPPING', '30000', 1],
    ]);
    expect(persisted.deliveries[0]?.shippingFee.toString()).toBe('30000');
  });
});
