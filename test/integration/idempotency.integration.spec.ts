import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { rentalScenario } from '../fixtures/rental.fixture';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  createTestShop,
  createTestCustomer,
  createTestProductWithVariant,
  createTestUserAndMember,
  uniqueCode,
} from '../fixtures/test-factories';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { RentalService } from '../../src/modules/rentals/application/rental.service';
import type { Clock } from '../../src/common/clock/clock';
import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import type { CurrentUser } from '../../src/common/types/current-user';
import type { CreateRentalOrderInput } from '../../src/modules/rentals/application/rental.contracts';
import { ConflictException } from '@nestjs/common';

class TestClock implements Clock {
  constructor(private currentTime: Date) {}
  now(): Date {
    return new Date(this.currentTime.getTime());
  }
  advanceMs(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
  setTime(time: Date): void {
    this.currentTime = new Date(time.getTime());
  }
}

describe('Idempotency Integration with PostgreSQL', () => {
  let prisma: PrismaService;
  let testClock: TestClock;
  let repo: PrismaRentalRepository;
  let auditLogMock: jest.MockedFunction<AuditPort['log']>;
  let auditMock: AuditPort;
  let service: RentalService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    testClock = new TestClock(new Date('2026-10-01T08:00:00.000Z'));
    repo = new PrismaRentalRepository(prisma, testClock, rentalPolicies);
    auditLogMock = jest.fn().mockResolvedValue(undefined);
    auditMock = {
      log: auditLogMock,
    };
    service = new RentalService(repo, auditMock, testClock);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    jest.clearAllMocks();
    testClock.setTime(new Date('2026-10-01T08:00:00.000Z'));
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('replays response body for identical idempotent request without creating duplicate orders', async () => {
    const shop = await createTestShop(prisma);
    const customer = await createTestCustomer(prisma, shop.id);
    const { user, member } = await createTestUserAndMember(prisma, shop.id);
    const { variant } = await createTestProductWithVariant(prisma, shop.id, {
      inventoryCount: 2,
    });

    const currentUser: CurrentUser = {
      userId: user.id,
      memberId: member.id,
      shopId: shop.id,
      email: user.email,
      fullName: user.fullName,
      permissions: ['rentals.create'],
    };

    const input: CreateRentalOrderInput = {
      customerId: customer.id,
      rentalStartAt: '2026-10-10T10:00:00.000Z',
      rentalEndAt: '2026-10-12T10:00:00.000Z',
      discountTotal: 0,
      items: [
        {
          variantId: variant.id,
          quantity: 1,
        },
      ],
      charges: [],
    };

    const idempotencyKey = `idem-${uniqueCode('key')}`;

    // First request
    const firstResult = await service.create(currentUser, input, idempotencyKey);
    expect(firstResult).not.toBeNull();
    expect(firstResult!.id).toBeDefined();

    const ordersAfterFirst = await prisma.rentalOrder.count({ where: { shopId: shop.id } });
    expect(ordersAfterFirst).toBe(1);

    // Second request with same key and same payload
    const secondResult = await service.create(currentUser, input, idempotencyKey);
    expect(secondResult).not.toBeNull();
    expect(secondResult!.id).toBe(firstResult!.id);
    expect(secondResult!.orderNumber).toBe(firstResult!.orderNumber);

    // Verify no duplicate order created
    const ordersAfterSecond = await prisma.rentalOrder.count({ where: { shopId: shop.id } });
    expect(ordersAfterSecond).toBe(1);

    // Audit log should only have been called once for the actual creation
    expect(auditLogMock).toHaveBeenCalledTimes(1);
  });

  it('rejects same key with different payload as HASH_MISMATCH', async () => {
    const shop = await createTestShop(prisma);
    const customer = await createTestCustomer(prisma, shop.id);
    const { user, member } = await createTestUserAndMember(prisma, shop.id);
    const { variant } = await createTestProductWithVariant(prisma, shop.id, { inventoryCount: 2 });

    const currentUser: CurrentUser = {
      userId: user.id,
      memberId: member.id,
      shopId: shop.id,
      email: user.email,
      fullName: user.fullName,
      permissions: ['rentals.create'],
    };

    const input1: CreateRentalOrderInput = {
      customerId: customer.id,
      rentalStartAt: '2026-10-10T10:00:00.000Z',
      rentalEndAt: '2026-10-12T10:00:00.000Z',
      discountTotal: 0,
      items: [{ variantId: variant.id, quantity: 1 }],
      charges: [],
    };

    const idempotencyKey = `idem-${uniqueCode('mismatch')}`;
    await service.create(currentUser, input1, idempotencyKey);

    // Mutated payload with same key
    const input2: CreateRentalOrderInput = {
      customerId: customer.id,
      rentalStartAt: '2026-10-15T10:00:00.000Z',
      rentalEndAt: '2026-10-17T10:00:00.000Z',
      discountTotal: 50000,
      items: [{ variantId: variant.id, quantity: 1 }],
      charges: [],
    };

    await expect(service.create(currentUser, input2, idempotencyKey)).rejects.toThrow(
      new ConflictException('Idempotency-Key was already used with a different request'),
    );
  });

  it('isolates idempotency keys across different tenant shops', async () => {
    const shopA = await createTestShop(prisma);
    const shopB = await createTestShop(prisma);

    const customerA = await createTestCustomer(prisma, shopA.id);
    const customerB = await createTestCustomer(prisma, shopB.id);

    const { user: userA, member: memberA } = await createTestUserAndMember(prisma, shopA.id);
    const { user: userB, member: memberB } = await createTestUserAndMember(prisma, shopB.id);

    const { variant: variantA } = await createTestProductWithVariant(prisma, shopA.id, {
      inventoryCount: 1,
    });
    const { variant: variantB } = await createTestProductWithVariant(prisma, shopB.id, {
      inventoryCount: 1,
    });

    const sharedKey = uniqueCode('shared-idem-key');

    const userObjA: CurrentUser = {
      userId: userA.id,
      memberId: memberA.id,
      shopId: shopA.id,
      email: userA.email,
      fullName: userA.fullName,
      permissions: ['rentals.create'],
    };

    const userObjB: CurrentUser = {
      userId: userB.id,
      memberId: memberB.id,
      shopId: shopB.id,
      email: userB.email,
      fullName: userB.fullName,
      permissions: ['rentals.create'],
    };

    const inputA: CreateRentalOrderInput = {
      customerId: customerA.id,
      rentalStartAt: '2026-10-10T10:00:00.000Z',
      rentalEndAt: '2026-10-12T10:00:00.000Z',
      discountTotal: 0,
      items: [{ variantId: variantA.id, quantity: 1 }],
      charges: [],
    };

    const inputB: CreateRentalOrderInput = {
      customerId: customerB.id,
      rentalStartAt: '2026-10-10T10:00:00.000Z',
      rentalEndAt: '2026-10-12T10:00:00.000Z',
      discountTotal: 0,
      items: [{ variantId: variantB.id, quantity: 1 }],
      charges: [],
    };

    // Both shops use the exact same key string; both must succeed independently
    const orderA = await service.create(userObjA, inputA, sharedKey);
    const orderB = await service.create(userObjB, inputB, sharedKey);

    expect(orderA).not.toBeNull();
    expect(orderB).not.toBeNull();
    expect(orderA!.id).toBeDefined();
    expect(orderB!.id).toBeDefined();
    expect(orderA!.shopId).toBe(shopA.id);
    expect(orderB!.shopId).toBe(shopB.id);

    const recordsInDb = await prisma.idempotencyRecord.findMany({ where: { key: sharedKey } });
    expect(recordsInDb).toHaveLength(2);
  });

  it('recovers stale in-progress claim (> 5 min lease) while rejecting fresh in-progress claim', async () => {
    const shop = await createTestShop(prisma);
    const key = `idem-stale-${uniqueCode('test')}`;
    const scope = 'rental-order.create';
    const requestHash = 'hash-12345';
    const initialTime = new Date('2026-10-01T12:00:00.000Z');
    testClock.setTime(initialTime);

    // Initial claim
    const claim1 = await repo.claimIdempotency({
      shopId: shop.id,
      scope,
      key,
      requestHash,
      expiresAt: new Date('2026-10-02T12:00:00.000Z'),
    });
    expect(claim1.state).toBe('CLAIMED');
    if (claim1.state !== 'CLAIMED') throw new Error('Expected claim1 to be CLAIMED');

    // 1. Fresh in-progress: advance 2 minutes (less than 5 minutes lease)
    testClock.advanceMs(2 * 60 * 1000);
    const freshClaim = await repo.claimIdempotency({
      shopId: shop.id,
      scope,
      key,
      requestHash,
      expiresAt: new Date('2026-10-02T12:00:00.000Z'),
    });
    expect(freshClaim.state).toBe('IN_PROGRESS');

    // 2. Stale in-progress: advance another 4 minutes (total 6 minutes since initial claim > 5m lease)
    testClock.advanceMs(4 * 60 * 1000);
    const staleRecovered = await repo.claimIdempotency({
      shopId: shop.id,
      scope,
      key,
      requestHash,
      expiresAt: new Date('2026-10-02T12:00:00.000Z'),
    });
    expect(staleRecovered.state).toBe('CLAIMED');
    if (staleRecovered.state !== 'CLAIMED')
      throw new Error('Expected staleRecovered to be CLAIMED');
    expect(staleRecovered.claimId).toBeDefined();
    expect(staleRecovered.claimId).not.toBe(claim1.claimId);
    await repo.releaseIdempotency(shop.id, scope, key, claim1.claimId);
    expect(
      await prisma.idempotencyRecord.findUnique({ where: { id: staleRecovered.claimId } }),
    ).not.toBeNull();
  });
  it('allows at most one business mutation for concurrent requests with the same key', async () => {
    const f = await rentalScenario(prisma);
    const results = await Promise.allSettled([
      service.create(f.principal, f.input, 'concurrent-key'),
      service.create(f.principal, f.input, 'concurrent-key'),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    for (const result of results)
      if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.rentalOrder.count()).toBe(1);
    expect(await prisma.rentalItemAllocation.count()).toBe(1);
    expect(await prisma.outboxEvent.count()).toBe(1);
    expect(await prisma.idempotencyRecord.count({ where: { completedAt: { not: null } } })).toBe(1);
    await expect(service.create(f.principal, f.input, 'concurrent-key')).resolves.toBeTruthy();
    expect(auditLogMock).toHaveBeenCalledTimes(1);
  });
});
