import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { SettingsService } from '../../src/modules/settings/application/settings.service';
import { PrismaSettingsRepository } from '../../src/modules/settings/infrastructure/prisma-settings.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
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
});
