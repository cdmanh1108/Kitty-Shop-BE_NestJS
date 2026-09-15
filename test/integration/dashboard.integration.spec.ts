import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { DashboardService } from '../../src/modules/dashboard/application/dashboard.service';
import { PrismaDashboardRepository } from '../../src/modules/dashboard/infrastructure/prisma-dashboard.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { rentalScenario } from '../fixtures/rental.fixture';
import { uniqueCode } from '../fixtures/test-factories';

describe('Dashboard PostgreSQL read model', () => {
  let prisma: PrismaService;
  const now = new Date('2026-10-01T05:00:00Z');
  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);
  afterEach(() => jest.restoreAllMocks());

  function service() {
    return new DashboardService(new PrismaDashboardRepository(prisma), { now: () => now });
  }
  async function order(
    f: Awaited<ReturnType<typeof rentalScenario>>,
    data: Partial<Prisma.RentalOrderUncheckedCreateInput> = {},
  ) {
    return prisma.rentalOrder.create({
      data: {
        shopId: f.shop.id,
        customerId: f.customer.id,
        orderNumber: uniqueCode('DASH'),
        rentalStartAt: new Date('2026-09-30T17:00:00Z'),
        rentalEndAt: new Date('2026-10-02T16:59:59Z'),
        status: 'ACTIVE',
        grandTotal: 1000,
        ...data,
      },
    });
  }

  it('returns zero metrics, empty lists and seven shop-local days for an empty shop', async () => {
    const f = await rentalScenario(prisma);
    const result = await service().summary(f.principal);
    expect(result).toMatchObject({
      revenueToday: 0,
      revenueMonth: 0,
      ordersToday: 0,
      rentingProducts: 0,
      outstandingAmount: 0,
      upcomingOrders: [],
      attentionOrders: [],
    });
    expect(result.revenueSeries).toEqual(
      Array.from({ length: 7 }, (_, i) => ({
        date: i === 6 ? '2026-10-01' : `2026-09-${25 + i}`,
        revenue: 0,
      })),
    );
  });

  it('uses signed non-deposit ledger amounts and half-open local day/month boundaries', async () => {
    const f = await rentalScenario(prisma);
    const o = await order(f);
    const payment = (data: Partial<Prisma.PaymentTransactionUncheckedCreateInput>) =>
      prisma.paymentTransaction.create({
        data: {
          shopId: f.shop.id,
          customerId: f.customer.id,
          orderId: o.id,
          transactionNumber: uniqueCode('PAY'),
          direction: 'IN',
          purpose: 'RENTAL_PAYMENT',
          paymentMethod: 'CASH',
          amount: 100,
          paidAt: now,
          ...data,
        },
      });
    await payment({ amount: 100, paidAt: new Date('2026-09-30T16:59:59.999Z') });
    await payment({ amount: 200, paidAt: new Date('2026-09-30T17:00:00Z') });
    await payment({ amount: 30, direction: 'OUT', purpose: 'ORDER_REFUND' });
    await payment({ amount: 50, purpose: 'OTHER' });
    await payment({ amount: 40, source: 'INTERNAL_TRANSFER', paymentMethod: 'INTERNAL_OFFSET' });
    await payment({ amount: 5000, purpose: 'DEPOSIT' });
    await payment({
      amount: 40,
      direction: 'OUT',
      purpose: 'DEPOSIT_REFUND',
      source: 'INTERNAL_TRANSFER',
      paymentMethod: 'INTERNAL_OFFSET',
    });
    await payment({ amount: 9000, voidedAt: now });
    await payment({ amount: 8000, status: 'PENDING' });
    await payment({ amount: 70, paidAt: new Date('2026-10-01T17:00:00Z') });
    await payment({ amount: 90, paidAt: new Date('2026-10-31T17:00:00Z') });
    const result = await service().summary(f.principal);
    expect(result.revenueToday).toBe(260);
    expect(result.revenueMonth).toBe(330);
    expect(result.revenueSeries.at(-2)).toEqual({ date: '2026-09-30', revenue: 100 });
    expect(result.revenueSeries.at(-1)).toEqual({ date: '2026-10-01', revenue: 260 });
    // Balance is lifetime ledger, not today's receipts or confirmation snapshots.
    expect(result.outstandingAmount).toBe(480);
  });

  it('classifies ACTIVE deadlines, excludes returned/completed from occupancy deadlines, and counts all attention rows', async () => {
    const f = await rentalScenario(prisma);
    await order(f, { rentalEndAt: new Date(now.getTime() - 1) });
    await order(f, { rentalEndAt: now });
    await order(f, { rentalEndAt: new Date('2026-10-02T16:59:59.999Z') });
    await order(f, { rentalEndAt: new Date('2026-10-02T17:00:00Z') });
    const returned = await order(f, {
      status: 'RETURNED',
      grandTotal: 0,
      rentalEndAt: new Date(now.getTime() - 1),
    });
    await order(f, { status: 'COMPLETED', rentalEndAt: new Date(now.getTime() - 1) });
    await order(f, { status: 'CANCELLED' });
    await order(f, { status: 'DRAFT' });
    await order(f, { status: 'CONFIRMED', rentalEndAt: new Date(now.getTime() - 1) });
    await order(f, { status: 'RESERVED', rentalStartAt: new Date('2026-10-01T17:00:00Z') });
    const result = await service().summary(f.principal);
    expect(result.ordersToday).toBe(7);
    expect(result.attentionOrders).toHaveLength(6);
    expect(result.attentionOrders[0]?.type).toBe('OVERDUE');
    expect(result.attentionOrders[1]).toMatchObject({
      id: returned.id,
      type: 'RETURN_SETTLEMENT',
      outstandingAmount: 0,
    });
    expect(result.outstandingAmount).toBe(6000);
  });

  it('scopes aggregates and joins by shop; bounds upcoming rows and orders timestamp ties by id', async () => {
    const f = await rentalScenario(prisma);
    const other = await rentalScenario(prisma);
    const otherOrder = await order(other, {
      grandTotal: 900000,
      rentalEndAt: new Date(now.getTime() - 1),
    });
    await prisma.paymentTransaction.create({
      data: {
        shopId: other.shop.id,
        customerId: other.customer.id,
        orderId: otherOrder.id,
        transactionNumber: uniqueCode('PAY'),
        direction: 'IN',
        purpose: 'RENTAL_PAYMENT',
        paymentMethod: 'CASH',
        amount: 800000,
        paidAt: now,
      },
    });
    const ids: string[] = [];
    for (let i = 0; i < 8; i++)
      ids.push((await order(f, { status: 'CONFIRMED', grandTotal: 0 })).id);
    await order(f, { status: 'CONFIRMED', rentalStartAt: new Date('2026-09-29T17:00:00Z') });
    const firstId = ids.sort()[0];
    if (!firstId) throw new Error('Expected seeded orders');
    await prisma.rentalOrderItem.create({
      data: {
        shopId: f.shop.id,
        orderId: firstId,
        productId: f.product.id,
        variantId: f.variant.id,
        quantity: 3,
        rentalStartAt: new Date('2026-09-30T17:00:00Z'),
        rentalEndAt: new Date('2026-10-02T16:59:59Z'),
        productNameSnapshot: 'Product',
        variantNameSnapshot: 'Variant',
        unitRentalPrice: 0,
        lineTotal: 0,
      },
    });
    const reads = jest.spyOn(prisma, '$queryRaw');
    const timezoneRead = jest.spyOn(prisma.shop, 'findUniqueOrThrow');
    const result = await service().summary(f.principal);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(timezoneRead).toHaveBeenCalledTimes(1);
    expect(result.revenueToday).toBe(0);
    expect(result.revenueMonth).toBe(0);
    expect(result.upcomingOrders[0]?.itemCount).toBe(3);
    expect(result.upcomingOrders.map((row) => row.id)).toEqual(ids.sort().slice(0, 6));
    expect(result.upcomingOrders.every((row) => row.customerName === f.customer.fullName)).toBe(
      true,
    );
    expect(result.ordersToday).toBe(8);
    expect(result.outstandingAmount).toBe(1000);
    expect(Object.keys(result.upcomingOrders[0] ?? {}).sort()).toEqual([
      'code',
      'customerName',
      'id',
      'itemCount',
      'pickupDate',
      'status',
    ]);
  });
});
