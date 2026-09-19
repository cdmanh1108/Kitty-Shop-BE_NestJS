import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaDeliveryRepository } from '../../src/modules/deliveries/infrastructure/prisma-delivery.repository';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import { uniqueCode } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Delivery monetary mutation boundary', () => {
  let prisma: PrismaService;
  let deliveries: PrismaDeliveryRepository;
  let rentals: PrismaRentalRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    deliveries = new PrismaDeliveryRepository(prisma);
    rentals = new PrismaRentalRepository(prisma, fixedClock, rentalPolicies);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  async function returnedOrder() {
    const f = await rentalScenario(prisma);
    const order = await rentals.createOrder({
      ...f.data,
      lines: f.data.lines.map((line) => ({ ...line, depositAmount: 300000 })),
    });
    if (!order) throw new Error('Expected rental order');

    const finance = new PrismaFinanceRepository(prisma);
    for (const [purpose, amount] of [
      ['RENTAL_PAYMENT', 200000],
      ['DEPOSIT', 300000],
    ] as const) {
      await finance.createPayment({
        shopId: f.shop.id,
        orderId: order.id,
        transactionNumber: uniqueCode('PAY'),
        direction: 'IN',
        purpose,
        paymentMethod: 'CASH',
        amount,
        paidAt: fixedClock.now(),
        createdBy: f.member.id,
      });
    }
    const actor = {
      shopId: f.shop.id,
      orderId: order.id,
      actorMemberId: f.member.id,
      actorUserId: f.user.id,
      actorName: f.user.fullName,
    };
    await rentals.confirm({ ...actor, collateralMethod: 'CASH', collateralAmount: 300000 });
    await rentals.transition({
      shopId: f.shop.id,
      orderId: order.id,
      fromStatuses: ['CONFIRMED'],
      toStatus: 'ACTIVE',
      changedBy: f.member.id,
    });
    await rentals.receiveReturn({
      ...actor,
      actualReturnedAt: f.data.rentalEndAt,
      items: [{ inventoryItemId: f.inventory.id, condition: 'NORMAL' }],
    });
    return { f, order, actor };
  }

  function createDelivery(shopId: string, orderId: string, memberId: string, shippingFee = 30000) {
    return deliveries.create({
      shopId,
      orderId,
      direction: 'OUTBOUND',
      method: 'SHOP_DELIVERY',
      shippingFee,
      createdBy: memberId,
    });
  }

  it('includes a paid delivery in a later settlement on a returned order', async () => {
    const { f, order, actor } = await returnedOrder();
    const delivery = await createDelivery(f.shop.id, order.id, f.member.id);
    await rentals.settleOrder(actor);

    const persisted = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true, charges: { where: { voidedAt: null } } },
    });
    expect(delivery).toMatchObject({ orderId: order.id });
    expect(persisted.grandTotal.toString()).toBe('230000');
    expect(persisted.chargesTotal.toString()).toBe('30000');
    expect(persisted.charges).toHaveLength(1);
    expect(persisted.charges[0]).toMatchObject({ chargeType: 'SHIPPING', quantity: 1 });
    expect(persisted.settlement).not.toBeNull();
    expect(persisted.settlement?.totalCharges.toString()).toBe('30000');
    expect(persisted.settlement?.refundAmount.toString()).toBe('270000');
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: delivery?.id, eventType: 'DELIVERY_CREATED' },
      }),
    ).toBe(1);
  });

  it('rejects a paid delivery after settlement without writing a job, charge, or event', async () => {
    const { f, order, actor } = await returnedOrder();
    await rentals.settleOrder(actor);
    const before = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true },
    });

    await expect(createDelivery(f.shop.id, order.id, f.member.id)).rejects.toMatchObject({
      code: 'ORDER_LOCKED',
    });

    const after = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true },
    });
    expect(after.grandTotal.toString()).toBe(before.grandTotal.toString());
    expect(after.chargesTotal.toString()).toBe(before.chargesTotal.toString());
    expect(after.settlement).toEqual(before.settlement);
    expect(await prisma.deliveryJob.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.rentalOrderCharge.count({ where: { orderId: order.id } })).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: { eventType: 'DELIVERY_CREATED', shopId: f.shop.id },
      }),
    ).toBe(0);
  });

  it('rejects a paid delivery on a cancelled order without writing any delivery side effect', async () => {
    const f = await rentalScenario(prisma);
    const order = await rentals.createOrder(f.data);
    if (!order) throw new Error('Expected rental order');
    await rentals.transition({
      shopId: f.shop.id,
      orderId: order.id,
      fromStatuses: ['DRAFT'],
      toStatus: 'CANCELLED',
      changedBy: f.member.id,
    });

    await expect(createDelivery(f.shop.id, order.id, f.member.id)).rejects.toMatchObject({
      code: 'ORDER_LOCKED',
    });
    expect(await prisma.deliveryJob.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.rentalOrderCharge.count({ where: { orderId: order.id } })).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: { eventType: 'DELIVERY_CREATED', shopId: f.shop.id },
      }),
    ).toBe(0);
  });

  it('keeps zero-fee delivery creation non-monetary on a settled order', async () => {
    const { f, order, actor } = await returnedOrder();
    await rentals.settleOrder(actor);

    const delivery = await createDelivery(f.shop.id, order.id, f.member.id, 0);
    const persisted = await prisma.rentalOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(delivery).not.toBeNull();
    expect(persisted.grandTotal.toString()).toBe('200000');
    expect(persisted.chargesTotal.toString()).toBe('0');
    expect(await prisma.rentalOrderCharge.count({ where: { orderId: order.id } })).toBe(0);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: delivery?.id, eventType: 'DELIVERY_CREATED' },
      }),
    ).toBe(1);
  });

  it('serializes a paid delivery and settlement into one valid outcome', async () => {
    const { f, order, actor } = await returnedOrder();
    await Promise.allSettled([
      createDelivery(f.shop.id, order.id, f.member.id),
      rentals.settleOrder(actor),
    ]);

    const persisted = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true, charges: { where: { voidedAt: null } } },
    });
    expect(persisted.settlement).not.toBeNull();
    if (persisted.charges.length === 1) {
      expect(persisted.grandTotal.toString()).toBe('230000');
      expect(persisted.settlement?.totalCharges.toString()).toBe('30000');
      expect(persisted.settlement?.refundAmount.toString()).toBe('270000');
    } else {
      expect(persisted.charges).toEqual([]);
      expect(persisted.grandTotal.toString()).toBe('200000');
      expect(persisted.settlement?.totalCharges.toString()).toBe('0');
      expect(persisted.settlement?.refundAmount.toString()).toBe('300000');
    }
    expect(await prisma.rentalSettlement.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('preserves each independent paid delivery and its fee', async () => {
    const { f, order } = await returnedOrder();
    await Promise.all([
      createDelivery(f.shop.id, order.id, f.member.id, 30000),
      createDelivery(f.shop.id, order.id, f.member.id, 45000),
    ]);

    const persisted = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { charges: { where: { voidedAt: null }, orderBy: { amount: 'asc' } } },
    });
    expect(persisted.grandTotal.toString()).toBe('275000');
    expect(persisted.chargesTotal.toString()).toBe('75000');
    expect(persisted.charges.map((charge) => [charge.amount.toString(), charge.quantity])).toEqual([
      ['30000', 1],
      ['45000', 1],
    ]);
    expect(await prisma.deliveryJob.count({ where: { orderId: order.id } })).toBe(2);
    expect(
      await prisma.outboxEvent.count({
        where: { eventType: 'DELIVERY_CREATED', shopId: f.shop.id },
      }),
    ).toBe(2);
  });

  it('shares the boundary with rental addCharge without losing either increment', async () => {
    const { f, order } = await returnedOrder();
    await Promise.all([
      createDelivery(f.shop.id, order.id, f.member.id, 30000),
      rentals.addCharge({
        shopId: f.shop.id,
        orderId: order.id,
        chargeType: 'CLEANING',
        amount: 10000,
        quantity: 2,
        description: 'Cleaning after return',
        createdBy: f.member.id,
      }),
    ]);

    const persisted = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { charges: { where: { voidedAt: null }, orderBy: { amount: 'asc' } } },
    });
    expect(persisted.grandTotal.toString()).toBe('250000');
    expect(persisted.chargesTotal.toString()).toBe('50000');
    expect(
      persisted.charges.map((charge) => [
        charge.chargeType,
        charge.amount.toString(),
        charge.quantity,
      ]),
    ).toEqual([
      ['CLEANING', '10000', 2],
      ['SHIPPING', '30000', 1],
    ]);
  });
});
