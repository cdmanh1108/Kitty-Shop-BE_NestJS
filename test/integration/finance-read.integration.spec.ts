import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { FinanceReadService } from '../../src/modules/finance/application/finance-read.service';
import { PrismaFinanceReadRepository } from '../../src/modules/finance/infrastructure/prisma-finance-read.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { rentalScenario } from '../fixtures/rental.fixture';
import { uniqueCode } from '../fixtures/test-factories';

describe('Finance normalized PostgreSQL read model', () => {
  let prisma: PrismaService;
  const now = new Date('2026-09-15T05:00:00Z');
  type Fixture = Awaited<ReturnType<typeof rentalScenario>>;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);
  afterEach(() => jest.restoreAllMocks());
  const service = () =>
    new FinanceReadService(new PrismaFinanceReadRepository(prisma), { now: () => now });
  const order = (f: Fixture, data: Partial<Prisma.RentalOrderUncheckedCreateInput> = {}) =>
    prisma.rentalOrder.create({
      data: {
        shopId: f.shop.id,
        customerId: f.customer.id,
        orderNumber: uniqueCode('FIN'),
        rentalStartAt: new Date('2026-09-10T00:00:00Z'),
        rentalEndAt: now,
        status: 'COMPLETED',
        completedAt: now,
        rentalSubtotal: 50000,
        grandTotal: 50000,
        ...data,
      },
    });
  const charge = (
    f: Fixture,
    orderId: string,
    amount: number,
    chargeType: 'DAMAGE' | 'SHIPPING' | 'LATE' | 'CLEANING' = 'DAMAGE',
  ) =>
    prisma.rentalOrderCharge.create({
      data: { shopId: f.shop.id, orderId, amount, quantity: 1, chargeType },
    });
  const payment = (
    f: Fixture,
    orderId: string,
    data: Partial<Prisma.PaymentTransactionUncheckedCreateInput>,
  ) =>
    prisma.paymentTransaction.create({
      data: {
        shopId: f.shop.id,
        customerId: f.customer.id,
        orderId,
        transactionNumber: uniqueCode('PAY'),
        direction: 'IN',
        purpose: 'DEPOSIT',
        paymentMethod: 'CASH',
        amount: 300000,
        paidAt: now,
        ...data,
      },
    });
  async function expense(f: Fixture, data: Partial<Prisma.ExpenseUncheckedCreateInput> = {}) {
    const category = await prisma.expenseCategory.create({
      data: { shopId: f.shop.id, code: uniqueCode('CAT'), name: 'Giặt hấp' },
    });
    return prisma.expense.create({
      data: {
        shopId: f.shop.id,
        categoryId: category.id,
        expenseNumber: uniqueCode('EXP'),
        description: 'Giặt đồ',
        amount: 300000,
        expenseDate: new Date('2026-09-15'),
        status: 'PAID',
        ...data,
      },
    });
  }
  it('returns zeros and no phantom rows in an empty period', async () => {
    const f = await rentalScenario(prisma);
    expect(await service().summary(f.principal, {})).toMatchObject({
      totalRevenue: '0',
      totalExpenses: '0',
      profit: '0',
      breakdown: [],
    });
    expect(
      await service().transactions(f.principal, { page: 1, limit: 20, sort: 'newest' }),
    ).toMatchObject({ items: [], meta: { total: 0 } });
  });
  it('scenario A: recognizes rental and canonical charges once, subtracting paid operating expenses', async () => {
    const f = await rentalScenario(prisma);
    const o = await order(f, {
      rentalSubtotal: 1000000,
      chargesTotal: 250000,
      grandTotal: 1250000,
    });
    await charge(f, o.id, 100000, 'LATE');
    await charge(f, o.id, 50000, 'CLEANING');
    await charge(f, o.id, 100000, 'SHIPPING');
    await expense(f);
    const summary = await service().summary(f.principal, {});
    expect(summary).toMatchObject({
      totalRevenue: '1250000.00',
      totalExpenses: '300000.00',
      profit: '950000.00',
    });
    expect(summary.breakdown).toEqual(
      expect.arrayContaining([
        { category: 'RENTAL', amount: '1000000.00' },
        { category: 'LATE', amount: '100000.00' },
        { category: 'CLEANING_DAMAGE', amount: '50000.00' },
        { category: 'SHIPPING', amount: '100000.00' },
      ]),
    );
  });
  it.each([
    { name: 'B', deposit: 200000, damage: 0, refund: 200000, additional: 0, expected: '50000.00' },
    {
      name: 'C',
      deposit: 300000,
      damage: 200000,
      refund: 100000,
      additional: 0,
      expected: '250000.00',
    },
    {
      name: 'D',
      deposit: 200000,
      damage: 350000,
      refund: 0,
      additional: 150000,
      expected: '400000.00',
    },
    {
      name: '500k charge',
      deposit: 300000,
      damage: 500000,
      refund: 0,
      additional: 200000,
      expected: '550000.00',
    },
  ])(
    'scenario $name: excludes deposit, deposit refund, offsets and additional collection',
    async (values) => {
      const f = await rentalScenario(prisma);
      const o = await order(f, { chargesTotal: values.damage, grandTotal: 50000 + values.damage });
      if (values.damage) await charge(f, o.id, values.damage);
      await payment(f, o.id, { amount: values.deposit });
      await payment(f, o.id, { amount: 50000, purpose: 'RENTAL_PAYMENT' });
      if (values.refund)
        await payment(f, o.id, {
          amount: values.refund,
          direction: 'OUT',
          purpose: 'DEPOSIT_REFUND',
        });
      if (values.additional)
        await payment(f, o.id, {
          amount: values.additional,
          purpose: 'RENTAL_PAYMENT',
          source: 'ADMIN_MANUAL',
        });
      if (values.damage) {
        await payment(f, o.id, {
          amount: Math.min(values.damage, values.deposit),
          direction: 'OUT',
          purpose: 'DEPOSIT_REFUND',
          source: 'INTERNAL_TRANSFER',
          paymentMethod: 'INTERNAL_OFFSET',
        });
        await payment(f, o.id, {
          amount: Math.min(values.damage, values.deposit),
          purpose: 'RENTAL_PAYMENT',
          source: 'INTERNAL_TRANSFER',
          paymentMethod: 'INTERNAL_OFFSET',
        });
      }
      expect(await service().summary(f.principal, {})).toMatchObject({
        totalRevenue: values.expected,
        totalExpenses: '0',
        profit: values.expected,
      });
      const rows = await service().transactions(f.principal, {
        page: 1,
        limit: 20,
        sort: 'newest',
      });
      expect(rows.items).toHaveLength(values.damage ? 2 : 1);
      expect(
        rows.items.every((row) => row.id.startsWith('rental:') || row.id.startsWith('charge:')),
      ).toBe(true);
    },
  );
  it('uses finalized lifecycle and exact local boundaries for every preset and custom period', async () => {
    const f = await rentalScenario(prisma);
    for (const status of [
      'DRAFT',
      'RESERVED',
      'CONFIRMED',
      'ACTIVE',
      'RETURNED',
      'CANCELLED',
    ] as const)
      await order(f, { status });
    await order(f, { completedAt: null });
    await order(f, { completedAt: new Date('2026-09-14T16:59:59.999Z') });
    await order(f, { completedAt: new Date('2026-09-14T17:00:00Z') });
    await order(f, { completedAt: new Date('2026-09-15T17:00:00Z') });
    await order(f, { completedAt: new Date('2026-09-30T17:00:00Z') });
    expect((await service().summary(f.principal, { preset: 'today' })).totalRevenue).toBe(
      '50000.00',
    );
    expect((await service().summary(f.principal, { preset: 'week' })).totalRevenue).toBe(
      '150000.00',
    );
    expect((await service().summary(f.principal, { preset: 'month' })).totalRevenue).toBe(
      '150000.00',
    );
    expect(
      (
        await service().summary(f.principal, {
          preset: 'custom',
          from: '2026-09-15',
          to: '2026-09-15',
        })
      ).totalRevenue,
    ).toBe('50000.00');
  });
  it('applies discount once and treats only valid post-completion rental refunds as revenue reductions', async () => {
    const f = await rentalScenario(prisma);
    const o = await order(f, {
      rentalSubtotal: 50000,
      discountTotal: 10000,
      chargesTotal: 20000,
      grandTotal: 60000,
    });
    await charge(f, o.id, 20000);
    await payment(f, o.id, { direction: 'OUT', purpose: 'ORDER_REFUND', amount: 5000 });
    await payment(f, o.id, {
      direction: 'OUT',
      purpose: 'ORDER_REFUND',
      amount: 9000,
      voidedAt: now,
    });
    await payment(f, o.id, {
      direction: 'OUT',
      purpose: 'ORDER_REFUND',
      amount: 9000,
      status: 'PENDING',
    });
    await payment(f, o.id, {
      direction: 'OUT',
      purpose: 'ORDER_REFUND',
      amount: 9000,
      paidAt: new Date('2026-09-14T00:00:00Z'),
    });
    const result = await service().summary(f.principal, {});
    expect(result.totalRevenue).toBe('55000.00');
    expect(result.breakdown).toEqual(
      expect.arrayContaining([
        { category: 'RENTAL', amount: '40000.00' },
        { category: 'REFUND', amount: '-5000.00' },
      ]),
    );
  });
  it('excludes void/unpaid expenses; filters expenseDate instead of createdAt/paidAt', async () => {
    const f = await rentalScenario(prisma);
    await expense(f, { paidAt: new Date('2026-10-01') });
    await expense(f, { status: 'PENDING' });
    await expense(f, { voidedAt: now });
    await expense(f, { expenseDate: new Date('2026-09-16') });
    expect((await service().summary(f.principal, { preset: 'today' })).totalExpenses).toBe(
      '300000.00',
    );
  });
  it('scopes every source by shop, filters before pagination, uses stable IDs and constant query count', async () => {
    const f = await rentalScenario(prisma);
    const other = await rentalScenario(prisma);
    const foreign = await order(other);
    await charge(other, foreign.id, 999999);
    await expense(other);
    await payment(other, foreign.id, { direction: 'OUT', purpose: 'ORDER_REFUND', amount: 999999 });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push('rental:' + (await order(f)).id);
    await expense(f);
    const raw = jest.spyOn(prisma, '$queryRaw');
    const zone = jest.spyOn(prisma.shop, 'findUniqueOrThrow');
    const first = await service().transactions(f.principal, {
      direction: 'INCOME',
      category: 'RENTAL',
      page: 1,
      limit: 2,
      sort: 'oldest',
    });
    expect(raw).toHaveBeenCalledTimes(1);
    expect(zone).toHaveBeenCalledTimes(1);
    expect(first.meta.total).toBe(5);
    expect(first.items.map((row) => row.id)).toEqual(ids.sort().slice(0, 2));
    const second = await service().transactions(f.principal, {
      direction: 'INCOME',
      page: 2,
      limit: 2,
      sort: 'oldest',
    });
    expect(second.items.map((row) => row.id)).toEqual(ids.sort().slice(2, 4));
    const newest = await service().transactions(f.principal, {
      direction: 'INCOME',
      page: 1,
      limit: 2,
      sort: 'newest',
    });
    expect(newest.items.map((row) => row.id)).toEqual(ids.sort().reverse().slice(0, 2));
    expect((await service().summary(f.principal, {})).totalRevenue).toBe('250000.00');
    expect((await service().summary(other.principal, {})).totalRevenue).toBe('50000.00');
  });
});
