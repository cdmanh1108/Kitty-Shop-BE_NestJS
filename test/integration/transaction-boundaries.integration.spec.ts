import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
  assertTestDatabase,
  testDatabaseUrl,
} from '../helpers/test-database';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { rentalScenario, fixedClock } from '../fixtures/rental.fixture';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { RentalService } from '../../src/modules/rentals/application/rental.service';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { PrismaReportRepository } from '../../src/modules/reports/infrastructure/prisma-report.repository';
import { AuditService } from '../../src/modules/audit/application/audit.service';
import { PrismaAuditRepository } from '../../src/modules/audit/infrastructure/prisma-audit.repository';
import { withRequestContext } from '../../src/common/request-context/request-context';
import { uniqueCode } from '../fixtures/test-factories';

describe('Real transaction boundaries and inventory lifecycle', () => {
  let prisma: PrismaService;
  let rentals: PrismaRentalRepository;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    rentals = new PrismaRentalRepository(prisma, fixedClock);
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterAll(disconnectTestDatabase);

  async function failOutbox(operation: () => Promise<void>): Promise<void> {
    assertTestDatabase(testDatabaseUrl());
    // PostgreSQL rejects the final outbox write; all preceding real writes must roll back.
    await prisma.$executeRaw`ALTER TABLE outbox_events ADD CONSTRAINT test_reject_outbox CHECK (false) NOT VALID`;
    try {
      await operation();
    } finally {
      await prisma.$executeRaw`ALTER TABLE outbox_events DROP CONSTRAINT test_reject_outbox`;
    }
  }

  it('rolls back rental, items, allocation, history and idempotency completion when outbox insertion fails', async () => {
    const f = await rentalScenario(prisma);
    const audit = new AuditService(new PrismaAuditRepository(prisma));
    const service = new RentalService(rentals, audit, fixedClock);
    await failOutbox(async () => {
      await expect(service.create(f.principal, f.input, 'outbox-failure')).rejects.toThrow();
    });
    expect(await prisma.rentalOrder.count()).toBe(0);
    expect(await prisma.rentalOrderItem.count()).toBe(0);
    expect(await prisma.rentalItemAllocation.count()).toBe(0);
    expect(await prisma.rentalOrderStatusHistory.count()).toBe(0);
    expect(await prisma.outboxEvent.count()).toBe(0);
    expect(await prisma.idempotencyRecord.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
    await expect(service.create(f.principal, f.input, 'outbox-failure')).resolves.toBeTruthy();
    expect(await prisma.idempotencyRecord.count({ where: { completedAt: { not: null } } })).toBe(1);
  });

  it('rolls back payment and recomputed order totals when required outbox fails', async () => {
    const f = await rentalScenario(prisma);
    const order = await rentals.createOrder(f.data);
    if (!order) throw new Error('Missing order');
    const finance = new PrismaFinanceRepository(prisma);
    await failOutbox(async () => {
      await expect(
        finance.createPayment({
          shopId: f.shop.id,
          orderId: order.id,
          transactionNumber: uniqueCode('PAY'),
          direction: 'IN',
          purpose: 'RENTAL_PAYMENT',
          paymentMethod: 'CASH',
          amount: 200000,
          paidAt: fixedClock.now(),
          createdBy: f.member.id,
        }),
      ).rejects.toThrow();
    });
    expect(await prisma.paymentTransaction.count()).toBe(0);
    expect(
      (await prisma.rentalOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus,
    ).toBe('UNPAID');
    expect(await prisma.outboxEvent.count()).toBe(1);
  });

  it('persists one safe audit with correlation and principal while replay creates no duplicate audit', async () => {
    const f = await rentalScenario(prisma);
    const service = new RentalService(
      rentals,
      new AuditService(new PrismaAuditRepository(prisma)),
      fixedClock,
    );
    await withRequestContext(
      { requestId: 'integration-rental', ipAddress: '127.0.0.1', userAgent: 'Jest' },
      () => service.create(f.principal, f.input, 'audit-key'),
    );
    await service.create(f.principal, f.input, 'audit-key');
    const rows = await prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      requestId: 'integration-rental',
      shopId: f.shop.id,
      actorUserId: f.user.id,
      actorMemberId: f.member.id,
    });
    expect(JSON.stringify(rows)).not.toMatch(/passwordHash|refreshToken|accessToken/);
  });

  it('has one winner for concurrent confirmation and returns inventory to CLEANING exactly once', async () => {
    const f = await rentalScenario(prisma);
    const order = await rentals.createOrder(f.data);
    if (!order) throw new Error('Missing order');
    const confirmation = {
      shopId: f.shop.id,
      orderId: order.id,
      fromStatuses: ['RESERVED'] as const,
      toStatus: 'CONFIRMED' as const,
      changedBy: f.member.id,
    };
    const results = await Promise.all([
      rentals.transition({ ...confirmation, fromStatuses: [...confirmation.fromStatuses] }),
      rentals.transition({ ...confirmation, fromStatuses: [...confirmation.fromStatuses] }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await rentals.transition({
      shopId: f.shop.id,
      orderId: order.id,
      fromStatuses: ['CONFIRMED'],
      toStatus: 'ACTIVE',
      changedBy: f.member.id,
    });
    expect(
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: f.inventory.id } }))
        .currentStatus,
    ).toBe('RENTED');
    const finish = {
      shopId: f.shop.id,
      orderId: order.id,
      fromStatuses: ['ACTIVE'] as const,
      toStatus: 'COMPLETED' as const,
      changedBy: f.member.id,
    };
    const completed = await Promise.all([
      rentals.transition({ ...finish, fromStatuses: [...finish.fromStatuses] }),
      rentals.transition({ ...finish, fromStatuses: [...finish.fromStatuses] }),
    ]);
    expect(completed.filter(Boolean)).toHaveLength(1);
    expect(
      await prisma.inventoryItem.findUniqueOrThrow({ where: { id: f.inventory.id } }),
    ).toMatchObject({ currentStatus: 'CLEANING', totalRentalCount: 1 });
    expect((await prisma.rentalItemAllocation.findFirstOrThrow()).status).toBe('RETURNED');
    expect(await prisma.outboxEvent.count()).toBe(4);
  });

  it('revenue SQL excludes deposits and voided payments with fixed period and tenant', async () => {
    const f = await rentalScenario(prisma);
    const order = await rentals.createOrder(f.data);
    if (!order) throw new Error('Missing order');
    const finance = new PrismaFinanceRepository(prisma);
    for (const purpose of ['RENTAL_PAYMENT', 'DEPOSIT'] as const)
      await finance.createPayment({
        shopId: f.shop.id,
        orderId: order.id,
        transactionNumber: uniqueCode('PAY'),
        direction: 'IN',
        purpose,
        paymentMethod: 'CASH',
        amount: 200000,
        paidAt: fixedClock.now(),
        createdBy: f.member.id,
      });
    const report = new PrismaReportRepository(prisma);
    const rows = await report.revenue({
      shopId: f.shop.id,
      from: new Date('2026-10-01T00:00:00Z'),
      until: new Date('2026-10-02T00:00:00Z'),
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.revenue)).toBe(200000);
    const paid = await prisma.paymentTransaction.findFirstOrThrow({
      where: { purpose: 'RENTAL_PAYMENT' },
    });
    await finance.voidPayment({ shopId: f.shop.id, paymentId: paid.id, voidedBy: f.member.id });
    expect(
      await report.revenue({
        shopId: f.shop.id,
        from: new Date('2026-10-01T00:00:00Z'),
        until: new Date('2026-10-02T00:00:00Z'),
        timezone: 'Asia/Ho_Chi_Minh',
      }),
    ).toEqual([]);
  });
});
