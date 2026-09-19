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

describe('Finance monetary mutation boundary', () => {
  let prisma: PrismaService;
  let finance: PrismaFinanceRepository;
  let rentals: PrismaRentalRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    finance = new PrismaFinanceRepository(prisma);
    rentals = new PrismaRentalRepository(prisma, fixedClock, rentalPolicies);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  async function returnedOrder(extraCharge = 0) {
    const f = await rentalScenario(prisma);
    const order = await rentals.createOrder({
      ...f.data,
      lines: f.data.lines.map((line) => ({ ...line, depositAmount: 300000 })),
    });
    if (!order) throw new Error('Expected rental order');
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
    if (extraCharge > 0) {
      await rentals.addCharge({
        shopId: f.shop.id,
        orderId: order.id,
        chargeType: 'CLEANING',
        amount: extraCharge,
        quantity: 1,
        description: 'Settlement offset fixture',
        createdBy: f.member.id,
      });
    }
    return { f, order, actor };
  }

  it('keeps an independent open manual payment voidable', async () => {
    const f = await rentalScenario(prisma);
    const order = await rentals.createOrder(f.data);
    if (!order) throw new Error('Expected rental order');
    const payment = await finance.createPayment({
      shopId: f.shop.id,
      orderId: order.id,
      transactionNumber: uniqueCode('PAY'),
      direction: 'IN',
      purpose: 'RENTAL_PAYMENT',
      paymentMethod: 'CASH',
      amount: 50000,
      paidAt: fixedClock.now(),
      createdBy: f.member.id,
    });
    if (!payment) throw new Error('Expected payment');

    const voided = await finance.voidPayment({
      shopId: f.shop.id,
      paymentId: payment.id,
      voidedBy: f.member.id,
    });
    expect(voided).toMatchObject({ id: payment.id, status: 'VOIDED', voidedBy: f.member.id });
  });

  it('protects confirmation receipts before settlement', async () => {
    const f = await rentalScenario(prisma);
    const order = await rentals.createOrder(f.data);
    if (!order) throw new Error('Expected rental order');
    await rentals.confirm({
      shopId: f.shop.id,
      orderId: order.id,
      actorMemberId: f.member.id,
      actorUserId: f.user.id,
      actorName: f.user.fullName,
      collateralMethod: 'CASH',
      collateralAmount: 300000,
    });
    const receipt = await prisma.paymentTransaction.findFirstOrThrow({
      where: { orderId: order.id, receiptKey: `RC-R-${order.id}` },
    });

    await expect(
      finance.voidPayment({ shopId: f.shop.id, paymentId: receipt.id, voidedBy: f.member.id }),
    ).rejects.toMatchObject({ code: 'PAYMENT_VOID_PROTECTED' });
    expect(
      await prisma.paymentTransaction.findUniqueOrThrow({ where: { id: receipt.id } }),
    ).toMatchObject({
      status: 'COMPLETED',
      voidedAt: null,
    });
  });

  it('protects settled manual and internal-transfer receipts without rewriting the snapshot', async () => {
    const { f, order, actor } = await returnedOrder(50000);
    await rentals.settleOrder(actor);
    const [manualPayment, internalTransfer] = await Promise.all([
      prisma.paymentTransaction.findFirstOrThrow({
        where: { orderId: order.id, receiptKey: null, purpose: 'RENTAL_PAYMENT' },
      }),
      prisma.paymentTransaction.findFirstOrThrow({
        where: { orderId: order.id, source: 'INTERNAL_TRANSFER' },
      }),
    ]);
    const before = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true },
    });

    await expect(
      finance.voidPayment({
        shopId: f.shop.id,
        paymentId: manualPayment.id,
        voidedBy: f.member.id,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_VOID_PROTECTED' });
    await expect(
      finance.voidPayment({
        shopId: f.shop.id,
        paymentId: internalTransfer.id,
        voidedBy: f.member.id,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_VOID_PROTECTED' });

    const after = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true },
    });
    expect(after.grandTotal.toString()).toBe(before.grandTotal.toString());
    expect(after.chargesTotal.toString()).toBe(before.chargesTotal.toString());
    expect(after.settlement).toEqual(before.settlement);
    expect(
      await prisma.paymentTransaction.count({
        where: { orderId: order.id, voidedAt: { not: null } },
      }),
    ).toBe(0);
  });

  it('allows a post-completion ORDER_REFUND without changing totals or settlement', async () => {
    const { f, order, actor } = await returnedOrder();
    await rentals.settleOrder(actor);
    const before = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true },
    });

    const refund = await finance.createPayment({
      shopId: f.shop.id,
      orderId: order.id,
      transactionNumber: uniqueCode('REFUND'),
      direction: 'OUT',
      purpose: 'ORDER_REFUND',
      paymentMethod: 'CASH',
      amount: 20000,
      paidAt: fixedClock.now(),
      createdBy: f.member.id,
    });
    const after = await prisma.rentalOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { settlement: true },
    });
    expect(refund).toMatchObject({ orderId: order.id, purpose: 'ORDER_REFUND', direction: 'OUT' });
    expect(after.grandTotal.toString()).toBe(before.grandTotal.toString());
    expect(after.chargesTotal.toString()).toBe(before.chargesTotal.toString());
    expect(after.settlement).toEqual(before.settlement);
  });

  it('serializes competing post-completion refunds within the re-read refund ceiling', async () => {
    const { f, order, actor } = await returnedOrder();
    await rentals.settleOrder(actor);
    const results = await Promise.allSettled(
      [150000, 100000].map((amount) =>
        finance.createPayment({
          shopId: f.shop.id,
          orderId: order.id,
          transactionNumber: uniqueCode('REFUND'),
          direction: 'OUT',
          purpose: 'ORDER_REFUND',
          paymentMethod: 'CASH',
          amount,
          paidAt: fixedClock.now(),
          createdBy: f.member.id,
        }),
      ),
    );
    const refunds = await prisma.paymentTransaction.findMany({
      where: { orderId: order.id, purpose: 'ORDER_REFUND', voidedAt: null },
    });
    const totalRefunded = refunds.reduce((total, refund) => total + Number(refund.amount), 0);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(totalRefunded).toBeLessThanOrEqual(200000);
  });
});
