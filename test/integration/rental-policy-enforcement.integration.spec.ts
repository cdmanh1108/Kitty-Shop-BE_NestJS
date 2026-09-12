import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { PrismaSettingsRepository } from '../../src/modules/settings/infrastructure/prisma-settings.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { fixedClock, rentalScenario, payRentalForConfirmation } from '../fixtures/rental.fixture';
import { createTestCustomer, uniqueCode } from '../fixtures/test-factories';

describe('Rental policy transaction enforcement', () => {
  let prisma: PrismaService;
  let repo: PrismaRentalRepository;
  let settings: SettingsService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    settings = new SettingsService(new PrismaSettingsRepository(prisma), {
      log: () => Promise.resolve(),
    });
    repo = new PrismaRentalRepository(prisma, fixedClock, settings);
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  async function booking() {
    const f = await rentalScenario(prisma);
    const order = await repo.createOrder(f.data);
    if (!order) throw new Error('Missing fixture order');
    await prisma.rentalOrder.update({
      where: { id: order.id },
      data: { createdAt: fixedClock.now() },
    });
    return { ...f, order };
  }

  it.each(['CONFIRMED', 'ACTIVE', 'COMPLETED'] as const)(
    'rejects cancellation from %s even when a caller supplies that source status',
    async (status) => {
      const f = await booking();
      await prisma.rentalOrder.update({ where: { id: f.order.id }, data: { status } });
      const before = await prisma.rentalItemAllocation.findMany({ where: { orderId: f.order.id } });
      expect(
        await repo.transition({
          shopId: f.shop.id,
          orderId: f.order.id,
          fromStatuses: [status],
          toStatus: 'CANCELLED',
          changedBy: f.member.id,
        }),
      ).toBeNull();
      expect((await repo.get(f.shop.id, f.order.id))?.status).toBe(status);
      expect(
        await prisma.rentalItemAllocation.findMany({ where: { orderId: f.order.id } }),
      ).toEqual(before);
      expect(await prisma.outboxEvent.count()).toBe(1);
    },
  );

  it('cancels a reserved booking and releases its allocation atomically', async () => {
    const f = await booking();
    const result = await repo.transition({
      shopId: f.shop.id,
      orderId: f.order.id,
      fromStatuses: ['RESERVED'],
      toStatus: 'CANCELLED',
      changedBy: f.member.id,
    });
    expect(result?.status).toBe('CANCELLED');
    const allocation = await prisma.rentalItemAllocation.findFirstOrThrow({
      where: { orderId: f.order.id },
    });
    expect(allocation.status).toBe('CANCELLED');
    expect(allocation.releasedAt).toBeInstanceOf(Date);
  });

  it('uses the saved shop policy and never resets the original booking deadline', async () => {
    const f = await booking();
    await settings.updateRentalPolicy(f.principal, { reschedule: { maxDaysFromBooking: 10 } });
    const input = {
      shopId: f.shop.id,
      orderId: f.order.id,
      changedBy: f.member.id,
      from: new Date('2026-10-11T12:00:00Z'),
      until: new Date('2026-10-13T12:00:00Z'),
    };
    expect((await repo.reschedule(input))?.rentalStartAt).toEqual(input.from);
    const before = await prisma.rentalItemAllocation.findMany({ where: { orderId: f.order.id } });
    await expect(
      repo.reschedule({
        ...input,
        from: new Date('2026-10-12T12:00:00Z'),
        until: new Date('2026-10-14T12:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'RESCHEDULE_LIMIT_EXCEEDED' });
    expect(await prisma.rentalItemAllocation.findMany({ where: { orderId: f.order.id } })).toEqual(
      before,
    );
    expect((await repo.get(f.shop.id, f.order.id))?.createdAt).toEqual(fixedClock.now());
    expect(await prisma.outboxEvent.count()).toBe(2);
  });

  it('rejects duration changes made directly through the repository', async () => {
    const f = await booking();
    await expect(
      repo.reschedule({
        shopId: f.shop.id,
        orderId: f.order.id,
        changedBy: f.member.id,
        from: new Date('2026-10-10T00:00:00Z'),
        until: new Date('2026-10-13T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'RENTAL_REPRICING_REQUIRED' });
    expect(await prisma.outboxEvent.count()).toBe(1);
  });

  it('filters alphabetic searches and customer IDs without an empty-phone wildcard', async () => {
    const f = await booking();
    await prisma.customer.update({
      where: { id: f.customer.id },
      data: { fullName: 'Aurora Customer' },
    });
    const other = await createTestCustomer(prisma, f.shop.id);
    await repo.createOrder({
      ...f.data,
      orderNumber: uniqueCode('RT'),
      customerId: other.id,
      rentalStartAt: new Date('2026-11-01T00:00:00Z'),
      rentalEndAt: new Date('2026-11-03T00:00:00Z'),
    });
    const criteria = { shopId: f.shop.id, page: 1, limit: 10, search: 'Aurora' };
    expect((await repo.list(criteria)).items.map((row) => row.id)).toEqual([f.order.id]);
    expect((await repo.list({ ...criteria, customerId: other.id })).items).toEqual([]);
    expect((await repo.list({ ...criteria, search: 'NoSuchCustomer' })).items).toEqual([]);
  });

  it('requires settled rental payment and cash deposit before confirmation', async () => {
    const f = await booking();
    const confirm = () => repo.transition({ shopId: f.shop.id, orderId: f.order.id, fromStatuses: ['RESERVED'], toStatus: 'CONFIRMED', changedBy: f.member.id });
    await expect(confirm()).rejects.toMatchObject({ code: 'ORDER_NOT_FULLY_PAID' });
    await payRentalForConfirmation(prisma, { shopId: f.shop.id, orderId: f.order.id, memberId: f.member.id, rentalAmount: 200000, depositAmount: 0 });
    await expect(confirm()).rejects.toMatchObject({ code: 'DEPOSIT_NOT_RECEIVED' });
    expect(await prisma.rentalOrderStatusHistory.count({ where: { orderId: f.order.id } })).toBe(1);
    await payRentalForConfirmation(prisma, { shopId: f.shop.id, orderId: f.order.id, memberId: f.member.id, rentalAmount: 0, depositAmount: 200000 });
    expect((await confirm())?.status).toBe('CONFIRMED');
    expect(await confirm()).toBeNull();
    expect(await prisma.rentalOrderStatusHistory.count({ where: { orderId: f.order.id } })).toBe(2);
  });

  it('holds document collateral without storing document numbers and returns it once', async () => {
    const f = await rentalScenario(prisma);
    const order = await repo.createOrder({ ...f.data, collateral: { method: 'DOCUMENT', documentType: 'CCCD' } });
    if (!order) throw new Error('Missing fixture order');
    const confirm = () => repo.transition({ shopId: f.shop.id, orderId: order.id, fromStatuses: ['RESERVED'], toStatus: 'CONFIRMED', changedBy: f.member.id });
    await payRentalForConfirmation(prisma, { shopId: f.shop.id, orderId: order.id, memberId: f.member.id, rentalAmount: 200000, depositAmount: 0 });
    await expect(confirm()).rejects.toMatchObject({ code: 'COLLATERAL_NOT_RECEIVED' });
    expect((await repo.receiveCollateral(f.shop.id, order.id, f.member.id))?.collateralStatus).toBe('HELD');
    expect((await confirm())?.status).toBe('CONFIRMED');
    await repo.transition({ shopId: f.shop.id, orderId: order.id, fromStatuses: ['CONFIRMED'], toStatus: 'ACTIVE', changedBy: f.member.id });
    await repo.transition({ shopId: f.shop.id, orderId: order.id, fromStatuses: ['ACTIVE'], toStatus: 'COMPLETED', changedBy: f.member.id });
    expect((await repo.returnCollateral(f.shop.id, order.id, f.member.id))?.collateralStatus).toBe('RETURNED');
    await expect(repo.returnCollateral(f.shop.id, order.id, f.member.id)).rejects.toMatchObject({ code: 'COLLATERAL_TRANSITION_NOT_ALLOWED' });
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.id, eventType: 'RENTAL_COLLATERAL_RETURNED' } })).toBe(1);
  });

  it('persists late fees and customer loyalty exactly once on completion', async () => {
    const f = await rentalScenario(prisma);
    const lateClock = { now: () => new Date('2026-10-15T00:00:00.000Z') };
    const lateRepo = new PrismaRentalRepository(prisma, lateClock, settings);
    const order = await repo.createOrder(f.data);
    if (!order) throw new Error('Missing fixture order');
    await payRentalForConfirmation(prisma, { shopId: f.shop.id, orderId: order.id, memberId: f.member.id, rentalAmount: 200000, depositAmount: 200000 });
    await repo.transition({ shopId: f.shop.id, orderId: order.id, fromStatuses: ['RESERVED'], toStatus: 'CONFIRMED', changedBy: f.member.id });
    await repo.transition({ shopId: f.shop.id, orderId: order.id, fromStatuses: ['CONFIRMED'], toStatus: 'ACTIVE', changedBy: f.member.id });
    const complete = () => lateRepo.transition({ shopId: f.shop.id, orderId: order.id, fromStatuses: ['ACTIVE'], toStatus: 'COMPLETED', changedBy: f.member.id });
    expect((await complete())?.status).toBe('COMPLETED');
    expect(await complete()).toBeNull();
    const charges = await prisma.rentalOrderCharge.findMany({ where: { orderId: order.id }, orderBy: { chargeType: 'asc' } });
    expect(charges.map((charge) => [charge.chargeType, charge.amount.toString()])).toEqual([['LATE', '30000'], ['RENTAL_EXTRA', '200000']]);
    expect((await prisma.rentalOrder.findUniqueOrThrow({ where: { id: order.id } })).grandTotal.toString()).toBe('430000');
    expect(await prisma.customerLoyaltyEntry.count({ where: { customerId: f.customer.id, orderId: order.id } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.id, eventType: 'RENTAL_ORDER_COMPLETED' } })).toBe(1);
  });

  it('earns the configured loyalty reward on the fifth completed rental, not bookings', async () => {
    const f = await rentalScenario(prisma);
    const pending = await repo.createOrder(f.data);
    if (!pending) throw new Error('Missing fixture order');
    expect((await repo.transition({ shopId: f.shop.id, orderId: pending.id, fromStatuses: ['RESERVED'], toStatus: 'CANCELLED', changedBy: f.member.id }))?.status).toBe('CANCELLED');
    for (let index = 0; index < 5; index += 1) {
      const order = await repo.createOrder({ ...f.data, orderNumber: uniqueCode('RT') });
      if (!order) throw new Error('Missing fixture order');
      await payRentalForConfirmation(prisma, { shopId: f.shop.id, orderId: order.id, memberId: f.member.id, rentalAmount: 200000, depositAmount: 200000 });
      await repo.transition({ shopId: f.shop.id, orderId: order.id, fromStatuses: ['RESERVED'], toStatus: 'CONFIRMED', changedBy: f.member.id });
      await repo.transition({ shopId: f.shop.id, orderId: order.id, fromStatuses: ['CONFIRMED'], toStatus: 'ACTIVE', changedBy: f.member.id });
      await repo.transition({ shopId: f.shop.id, orderId: order.id, fromStatuses: ['ACTIVE'], toStatus: 'COMPLETED', changedBy: f.member.id });
      expect(await prisma.customerLoyaltyEntry.count({ where: { customerId: f.customer.id, rewardValue: { gt: 0 } } })).toBe(index === 4 ? 1 : 0);
      await prisma.inventoryItem.update({ where: { id: f.inventory.id }, data: { currentStatus: 'AVAILABLE' } });
    }
    expect(await prisma.customerLoyaltyEntry.count({ where: { customerId: f.customer.id } })).toBe(5);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'LOYALTY_REWARD_EARNED' } })).toBe(1);
  });

  it('lists rentals intersecting a date range, including orders spanning the whole range', async () => {
    const f = await rentalScenario(prisma);
    const periods = [
      ['2026-09-01T00:00:00Z', '2026-09-12T00:00:00Z'],
      ['2026-09-12T00:00:00Z', '2026-09-30T00:00:00Z'],
      ['2026-09-01T00:00:00Z', '2026-09-30T00:00:00Z'],
      ['2026-08-01T00:00:00Z', '2026-08-05T00:00:00Z'],
    ] as const;
    const ids: string[] = [];
    for (const [start, end] of periods) {
      const order = await prisma.rentalOrder.create({
        data: { shopId: f.shop.id, customerId: f.customer.id, orderNumber: uniqueCode('RT'), rentalStartAt: new Date(start), rentalEndAt: new Date(end), createdBy: f.member.id },
      });
      ids.push(order.id);
    }
    const result = await repo.list({ shopId: f.shop.id, page: 1, limit: 20, from: new Date('2026-09-10T00:00:00Z'), until: new Date('2026-09-20T00:00:00Z') });
    expect(result.items.map((order) => order.id).sort()).toEqual(ids.slice(0, 3).sort());
    expect(result.items[0]).toMatchObject({ itemCount: 0, productCount: 0 });
    expect(result.items[0]).not.toHaveProperty('items');
  });

  it('aggregates rental list counts without returning item rows', async () => {
    const f = await booking();
    const result = await repo.list({ shopId: f.shop.id, page: 1, limit: 10 });
    const row = result.items.find((item) => item.id === f.order.id);
    expect(row).toMatchObject({ itemCount: 1, productCount: 1 });
    expect(row).not.toHaveProperty('items');
  });
});
