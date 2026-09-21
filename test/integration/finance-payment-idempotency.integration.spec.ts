import { ConflictException } from '@nestjs/common';
import type { Clock } from '../../src/common/clock/clock';
import { FinanceService } from '../../src/modules/finance/application/finance.service';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { rentalScenario } from '../fixtures/rental.fixture';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import type { PrismaService } from '../../src/database/prisma/prisma.service';

class TestClock implements Clock {
  constructor(private current = new Date('2026-10-01T12:00:00.000Z')) {}

  now() {
    return new Date(this.current);
  }

  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

describe('manual receipt idempotency', () => {
  let prisma: PrismaService;
  let clock: TestClock;
  let finance: FinanceService;
  let rentals: PrismaRentalRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    clock = new TestClock();
    finance = new FinanceService(
      new PrismaFinanceRepository(prisma, clock),
      { log: jest.fn().mockResolvedValue(undefined) },
      clock,
    );
    rentals = new PrismaRentalRepository(prisma, clock, rentalPolicies);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    clock = new TestClock();
    finance = new FinanceService(
      new PrismaFinanceRepository(prisma, clock),
      { log: jest.fn().mockResolvedValue(undefined) },
      clock,
    );
    rentals = new PrismaRentalRepository(prisma, clock, rentalPolicies);
  });

  afterAll(disconnectTestDatabase);

  it('replays a lost-response retry as one payment, durable audit and outbox event', async () => {
    const fixture = await rentalScenario(prisma);
    const order = await rentals.createOrder(fixture.data);
    if (!order) throw new Error('Expected rental order');
    const input = {
      direction: 'IN' as const,
      purpose: 'RENTAL_PAYMENT' as const,
      paymentMethod: 'CASH' as const,
      amount: 100000,
      note: 'Synthetic receipt',
    };
    const key = 'receipt-lost-response';

    const first = await finance.createPayment(fixture.principal, order.id, input, key);
    clock.advance(60_000);
    const replay = await finance.createPayment(fixture.principal, order.id, input, key);

    expect(replay).toEqual(first);
    expect(await prisma.paymentTransaction.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          shopId: fixture.shop.id,
          action: 'CREATE',
          entityType: 'payment_transaction',
          entityId: first.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { shopId: fixture.shop.id, eventType: 'PAYMENT_RECORDED', aggregateId: first.id },
      }),
    ).toBe(1);
    expect(
      await prisma.idempotencyRecord.findFirstOrThrow({
        where: { shopId: fixture.shop.id, key, completedAt: { not: null } },
      }),
    ).toMatchObject({ responseCode: 201 });
  });

  it('does not write a second receipt when the same key has a different command', async () => {
    const fixture = await rentalScenario(prisma);
    const order = await rentals.createOrder(fixture.data);
    if (!order) throw new Error('Expected rental order');
    const key = 'receipt-mismatch';
    const input = {
      direction: 'IN' as const,
      purpose: 'RENTAL_PAYMENT' as const,
      paymentMethod: 'CASH' as const,
      amount: 100000,
    };
    await finance.createPayment(fixture.principal, order.id, input, key);

    await expect(
      finance.createPayment(fixture.principal, order.id, { ...input, amount: 100001 }, key),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.paymentTransaction.count({ where: { orderId: order.id } })).toBe(1);
  });
});
