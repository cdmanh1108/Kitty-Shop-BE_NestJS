import type { PrismaService } from '../../src/database/prisma/prisma.service';
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

describe('Rental monetary mutation boundary', () => {
  let prisma: PrismaService;
  let rentals: PrismaRentalRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
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

  async function addCharge(shopId: string, orderId: string, memberId: string, amount = 35000) {
    return rentals.addCharge({
      shopId,
      orderId,
      chargeType: 'CLEANING',
      amount,
      quantity: 2,
      description: 'Post-return charge',
      createdBy: memberId,
    });
  }

  it('includes a committed charge in settlement and rejects all later charge writes', async () => {
    const { f, order, actor } = await returnedOrder();
    await addCharge(f.shop.id, order.id, f.member.id);
    await rentals.settleOrder(actor);

    const settled = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true, charges: { where: { voidedAt: null } } },
    });
    expect(settled.grandTotal.toString()).toBe('270000');
    expect(settled.chargesTotal.toString()).toBe('70000');
    expect(settled.settlement).not.toBeNull();
    expect(settled.settlement?.totalCharges.toString()).toBe('70000');
    expect(settled.settlement?.refundAmount.toString()).toBe('230000');
    await expect(addCharge(f.shop.id, order.id, f.member.id)).rejects.toMatchObject({
      code: 'ORDER_LOCKED',
    });
    expect(await prisma.rentalOrderCharge.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('keeps a settlement snapshot intact when the settlement commits before a charge', async () => {
    const { f, order, actor } = await returnedOrder();
    await rentals.settleOrder(actor);
    await expect(addCharge(f.shop.id, order.id, f.member.id)).rejects.toMatchObject({
      code: 'ORDER_LOCKED',
    });
    const settled = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true },
    });
    expect(settled.grandTotal.toString()).toBe('200000');
    expect(settled.chargesTotal.toString()).toBe('0');
    expect(settled.settlement?.refundAmount.toString()).toBe('300000');
  });

  it('serializes competing charge and settlement commands into one valid order', async () => {
    const { f, order, actor } = await returnedOrder();
    const results = await Promise.allSettled([
      addCharge(f.shop.id, order.id, f.member.id),
      rentals.settleOrder(actor),
    ]);
    const persisted = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true, charges: { where: { voidedAt: null } } },
    });

    expect(persisted.settlement).not.toBeNull();
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    if (persisted.charges.length === 1) {
      expect(persisted.grandTotal.toString()).toBe('270000');
      expect(persisted.settlement?.totalCharges.toString()).toBe('70000');
      expect(persisted.settlement?.refundAmount.toString()).toBe('230000');
    } else {
      expect(persisted.charges).toEqual([]);
      expect(persisted.grandTotal.toString()).toBe('200000');
      expect(persisted.settlement?.totalCharges.toString()).toBe('0');
      expect(persisted.settlement?.refundAmount.toString()).toBe('300000');
    }
    expect(await prisma.rentalSettlement.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: order.id, eventType: 'RENTAL_ORDER_COMPLETED' },
      }),
    ).toBe(1);
  });

  it('keeps both independent concurrent charges and their quantities', async () => {
    const { f, order } = await returnedOrder();
    await Promise.all([
      addCharge(f.shop.id, order.id, f.member.id, 35000),
      addCharge(f.shop.id, order.id, f.member.id, 45000),
    ]);
    const persisted = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { charges: { where: { voidedAt: null }, orderBy: { amount: 'asc' } } },
    });
    expect(persisted.chargesTotal.toString()).toBe('160000');
    expect(persisted.grandTotal.toString()).toBe('360000');
    expect(persisted.charges.map((charge) => [charge.amount.toString(), charge.quantity])).toEqual([
      ['35000', 2],
      ['45000', 2],
    ]);
  });
});
