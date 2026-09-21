import type { CurrentUser } from '../../src/common/types/current-user';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { WebRentalService } from '../../src/modules/rentals/application/web-rental.service';
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
  createTestCustomer,
  createTestProductWithVariant,
  createTestShop,
  createTestUserAndMember,
} from '../fixtures/test-factories';

describe('Web rental shipping persistence', () => {
  let prisma: PrismaService;
  let settings: SettingsService;
  let rentals: PrismaRentalRepository;
  let web: WebRentalService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    settings = new SettingsService(new PrismaSettingsRepository(prisma), {
      log: () => Promise.resolve(),
    });
    rentals = new PrismaRentalRepository(prisma, fixedClock, settings);
    web = new WebRentalService(rentals, settings, new PrismaCustomerRepository(prisma), fixedClock);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  async function setup(input: { shippingFee: number; inventoryCount?: number }) {
    const shop = await createTestShop(prisma);
    const { user, member } = await createTestUserAndMember(prisma, shop.id);
    const principal: CurrentUser = {
      userId: user.id,
      memberId: member.id,
      shopId: shop.id,
      email: user.email,
      fullName: user.fullName,
      permissions: [],
    };
    await settings.updateRentalPolicy(principal, {
      delivery: { standardShippingFee: input.shippingFee },
    });
    const customer = await createTestCustomer(prisma, shop.id);
    const catalog = await createTestProductWithVariant(prisma, shop.id, {
      dailyRate: 150000,
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
    const quoteRequest = {
      pickupDate: '2026-10-10',
      returnDate: '2026-10-13',
      items: [{ variantId: input.variantId, quantity }],
      deliveryMethod: input.delivery,
    };
    const quote = await web.calculateQuote(input.shopId, quoteRequest);
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
        paymentMethod: 'cash',
      },
      'web-shipping-key',
    );
    const order = await prisma.rentalOrder.findFirstOrThrow({
      where: { shopId: input.shopId, orderNumber: response.orderCode },
      include: { charges: true, deliveries: true, items: { include: { allocations: true } } },
    });
    return { quote, response, order };
  }

  it('records a policy shipping fee once across quote, Web create response, and PostgreSQL', async () => {
    const { shop, customer, catalog } = await setup({ shippingFee: 30000 });
    const { quote, response, order } = await quoteAndCreate({
      shopId: shop.id,
      customer,
      variantId: catalog.variant.id,
      delivery: 'shop_delivery',
    });

    expect(quote).toMatchObject({
      rentalSubtotal: 450000,
      shippingFee: 30000,
      totalAmount: 480000,
    });
    expect(response.totalAmount).toBe(480000);
    expect(order.rentalSubtotal.toString()).toBe('450000');
    expect(order.chargesTotal.toString()).toBe('30000');
    expect(order.grandTotal.toString()).toBe('480000');
    expect(order.charges).toHaveLength(1);
    expect(order.charges[0]).toMatchObject({ chargeType: 'SHIPPING', quantity: 1 });
    expect(order.charges[0]?.amount.toString()).toBe('30000');
    expect(order.deliveries).toHaveLength(1);
    expect(order.deliveries[0]).toMatchObject({ direction: 'OUTBOUND', method: 'DELIVERY' });
    expect(order.deliveries[0]?.shippingFee.toString()).toBe('30000');
  });

  it('keeps delivery metadata but omits a zero-fee SHIPPING charge', async () => {
    const { shop, customer, catalog } = await setup({ shippingFee: 0 });
    const { quote, response, order } = await quoteAndCreate({
      shopId: shop.id,
      customer,
      variantId: catalog.variant.id,
      delivery: 'shop_delivery',
    });

    expect(quote).toMatchObject({ rentalSubtotal: 450000, shippingFee: 0, totalAmount: 450000 });
    expect(response.totalAmount).toBe(450000);
    expect(order.chargesTotal.toString()).toBe('0');
    expect(order.grandTotal.toString()).toBe('450000');
    expect(order.charges).toEqual([]);
    expect(order.deliveries).toHaveLength(1);
    expect(order.deliveries[0]).toMatchObject({ method: 'DELIVERY' });
    expect(order.deliveries[0]?.shippingFee.toString()).toBe('0');
  });

  it('does not charge shipping for self pickup even when the saved policy has a fee', async () => {
    const { shop, customer, catalog } = await setup({ shippingFee: 45000 });
    const { quote, response, order } = await quoteAndCreate({
      shopId: shop.id,
      customer,
      variantId: catalog.variant.id,
      delivery: 'self_pickup',
    });

    expect(quote).toMatchObject({ rentalSubtotal: 450000, shippingFee: 0, totalAmount: 450000 });
    expect(response.totalAmount).toBe(450000);
    expect(order.charges).toEqual([]);
    expect(order.chargesTotal.toString()).toBe('0');
    expect(order.deliveries[0]).toMatchObject({ method: 'PICKUP' });
    expect(order.deliveries[0]?.shippingFee.toString()).toBe('0');
  });

  it('charges shipping once for a multi-unit Web line and preserves all allocations', async () => {
    const { shop, customer, catalog } = await setup({ shippingFee: 30000, inventoryCount: 2 });
    const { quote, response, order } = await quoteAndCreate({
      shopId: shop.id,
      customer,
      variantId: catalog.variant.id,
      quantity: 2,
      delivery: 'shop_delivery',
    });

    expect(quote).toMatchObject({
      rentalSubtotal: 900000,
      shippingFee: 30000,
      totalAmount: 930000,
    });
    expect(response.totalAmount).toBe(930000);
    expect(order.grandTotal.toString()).toBe('930000');
    expect(order.charges).toHaveLength(1);
    expect(order.charges[0]).toMatchObject({ chargeType: 'SHIPPING', quantity: 1 });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ quantity: 2 });
    expect(order.items[0]?.allocations).toHaveLength(2);
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
