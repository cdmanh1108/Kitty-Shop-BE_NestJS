import { Logger } from '@nestjs/common';
import { Prisma, type IdempotencyRecord } from '@prisma/client';
import type { Clock } from '../src/common/clock/clock';
import {
  currentRequestMetadata,
  withRequestContext,
} from '../src/common/request-context/request-context';
import type { CurrentUser } from '../src/common/types/current-user';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/application/audit.service';
import type { AuditEntry, AuditPort } from '../src/modules/audit/domain/audit.port';
import type { AuditRepository } from '../src/modules/audit/domain/audit.repository';
import { RentalService } from '../src/modules/rentals/application/rental.service';
import type { CreateRentalOrderInput } from '../src/modules/rentals/application/rental.contracts';
import { RentalClaimLostError } from '../src/modules/rentals/domain/rental-errors';
import type { RentalOrderDetails } from '../src/modules/rentals/domain/rental.models';
import type {
  CreateRentalOrderData,
  RentalRepository,
} from '../src/modules/rentals/domain/rental.repository';
import { createOrder } from '../src/modules/rentals/infrastructure/rental-booking';
import { DEFAULT_RENTAL_POLICY } from '../src/modules/settings/domain/rental-policy';
import {
  claimIdempotency,
  completeRentalClaim,
  lockRentalClaim,
  releaseIdempotency,
  RENTAL_CLAIM_LEASE_MS,
} from '../src/modules/rentals/infrastructure/rental-idempotency';

const now = new Date('2026-09-11T03:00:00Z');
const clock: Clock = { now: () => new Date(now) };
const input = {
  shopId: 'shop',
  scope: 'rental-order.create',
  key: 'key',
  requestHash: 'hash',
  expiresAt: new Date(now.getTime() + 86400000),
};
const user: CurrentUser = {
  userId: 'user',
  memberId: 'member',
  shopId: 'shop',
  email: null,
  fullName: 'Admin',
  permissions: [],
};
const entry: AuditEntry = {
  shopId: user.shopId,
  actorUserId: user.userId,
  actorMemberId: user.memberId,
  action: 'CREATE',
  entityType: 'rental_order',
  entityId: 'order',
};
function orderDetails(): NonNullable<RentalOrderDetails> {
  return {
    id: 'order',
    shopId: 'shop',
    orderNumber: 'RT-20260911-ABCDEF',
    customerId: 'customer',
    locationId: null,
    rentalStartAt: now,
    rentalEndAt: new Date(now.getTime() + 86400000),
    actualStartedAt: null,
    completedAt: null,
    cancelledAt: null,
    status: 'RESERVED',
    paymentStatus: 'UNPAID',
    depositStatus: 'PENDING',
    currency: 'VND',
    rentalSubtotal: new Prisma.Decimal(50000),
    chargesTotal: new Prisma.Decimal(0),
    discountTotal: new Prisma.Decimal(0),
    depositRequired: new Prisma.Decimal(200000),
    collateralMethod: 'CASH',
    documentType: null,
    collateralStatus: 'REQUIRED',
    collateralReceivedAt: null,
    collateralReturnedAt: null,
    grandTotal: new Prisma.Decimal(50000),
    note: null,
    internalNote: null,
    metadata: null,
    createdBy: 'member',
    updatedBy: 'member',
    createdAt: now,
    updatedAt: now,
    location: null,
    confirmation: null,
    statusHistory: [],
    items: [],
    charges: [],
    payments: [],
    deliveries: [],
    customer: {
      id: 'customer',
      shopId: 'shop',
      customerCode: 'CUS-1',
      fullName: 'Customer',
      phone: '0900000000',
      normalizedPhone: '0900000000',
      email: null,
      facebook: null,
      zalo: null,
      birthday: null,
      gender: null,
      customerType: 'NORMAL',
      status: 'ACTIVE',
      source: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
  };
}
function persistedClaim(overrides: Partial<IdempotencyRecord> = {}): IdempotencyRecord {
  return {
    id: 'old-claim',
    ...input,
    responseBody: null,
    responseCode: null,
    completedAt: null,
    createdAt: now,
    ...overrides,
  };
}

// A tiny in-memory model of atomic claim operations, not a PostgreSQL transaction emulator.
// Actual row locking, rollback, unique-index arbitration and P2034 retries require DB tests.
function claimStore(initial: IdempotencyRecord[] = []) {
  const records = new Map(
    initial.map((record) => [JSON.stringify([record.shopId, record.scope, record.key]), record]),
  );
  const identity = (shopId: string, scope: string, key: string) =>
    JSON.stringify([shopId, scope, key]);
  type Delegate = Parameters<typeof claimIdempotency>[0]['idempotencyRecord'];
  const create = jest.fn<ReturnType<Delegate['create']>, Parameters<Delegate['create']>>((args) => {
    const data = args.data;
    const key = identity(data.shopId ?? '', data.scope, data.key);
    if (records.has(key))
      return Promise.reject(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );
    const record = persistedClaim({
      shopId: data.shopId,
      scope: data.scope,
      key: data.key,
      requestHash: data.requestHash ?? null,
      id: data.id,
      createdAt: new Date(data.createdAt ?? now),
      expiresAt: new Date(data.expiresAt),
    });
    records.set(key, record);
    return Promise.resolve(record);
  });
  const find = jest.fn<ReturnType<Delegate['findUnique']>, Parameters<Delegate['findUnique']>>(
    (args) => {
      const where = args.where.shopId_scope_key;
      return Promise.resolve(
        where ? (records.get(identity(where.shopId, where.scope, where.key)) ?? null) : null,
      );
    },
  );
  const update = jest.fn<ReturnType<Delegate['updateMany']>, Parameters<Delegate['updateMany']>>(
    (args) => {
      const where = args.where;
      const record = [...records.values()].find(
        (record) =>
          record.id === where?.id &&
          record.shopId === where.shopId &&
          record.scope === where.scope &&
          record.key === where.key,
      );
      if (!record || record.completedAt) return Promise.resolve({ count: 0 });
      if (where?.requestHash !== undefined && where.requestHash !== record.requestHash)
        return Promise.resolve({ count: 0 });
      const before = where?.createdAt;
      if (
        before &&
        typeof before === 'object' &&
        'lte' in before &&
        (before.lte instanceof Date || typeof before.lte === 'string') &&
        record.createdAt > new Date(before.lte)
      )
        return Promise.resolve({ count: 0 });
      if (typeof args.data.id === 'string') record.id = args.data.id;
      if (args.data.createdAt instanceof Date) record.createdAt = args.data.createdAt;
      if (args.data.expiresAt instanceof Date) record.expiresAt = args.data.expiresAt;
      if (args.data.completedAt instanceof Date) {
        record.completedAt = args.data.completedAt;
        record.responseCode = 201;
        // Fixture stores the exact same serialized detail used by completion.
        record.responseBody = JSON.parse(JSON.stringify(orderDetails())) as Prisma.JsonValue;
      }
      return Promise.resolve({ count: 1 });
    },
  );
  const remove = jest.fn<ReturnType<Delegate['deleteMany']>, Parameters<Delegate['deleteMany']>>(
    (args) => {
      let count = 0;
      for (const [key, record] of records) {
        const where = args?.where;
        if (
          record.shopId !== where?.shopId ||
          record.scope !== where.scope ||
          record.key !== where.key
        )
          continue;
        if (where.id !== undefined && where.id !== record.id) continue;
        if (where.completedAt === null && record.completedAt !== null) continue;
        const expiry = where.expiresAt;
        if (
          expiry &&
          typeof expiry === 'object' &&
          'lte' in expiry &&
          (expiry.lte instanceof Date || typeof expiry.lte === 'string') &&
          record.expiresAt > new Date(expiry.lte)
        )
          continue;
        records.delete(key);
        count += 1;
      }
      return Promise.resolve({ count });
    },
  );
  return {
    records,
    create,
    find,
    update,
    remove,
    prisma: {
      idempotencyRecord: { create, findUnique: find, updateMany: update, deleteMany: remove },
    },
  };
}

afterEach(() => jest.restoreAllMocks());
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

describe('audit port and request enrichment', () => {
  const repository = (): jest.Mocked<AuditRepository> => ({
    create: jest.fn().mockResolvedValue(undefined),
    list: jest.fn(),
  });
  it('keeps interleaved request metadata isolated and explicit actor/tenant authoritative', async () => {
    const persistence = repository();
    const audit: AuditPort = new AuditService(persistence);
    await Promise.all(
      ['request-A', 'request-B'].map((requestId) =>
        withRequestContext(
          { requestId, ipAddress: '127.0.0.1', userAgent: requestId },
          async () => {
            await Promise.resolve();
            await audit.log({ ...entry, entityId: requestId });
          },
        ),
      ),
    );
    const rows = persistence.create.mock.calls.map(([row]) => row);
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(row).toMatchObject({
        ...entry,
        entityId: row.requestId,
        userAgent: row.requestId,
        ipAddress: '127.0.0.1',
      });
    expect(currentRequestMetadata()).toBeUndefined();
    await audit.log(entry);
    expect(persistence.create.mock.calls[2]?.[0]).toMatchObject({
      ...entry,
      requestId: undefined,
      ipAddress: undefined,
      userAgent: undefined,
    });
  });
  it('does not reject successful business work when best-effort persistence fails', async () => {
    const persistence = repository();
    persistence.create.mockRejectedValue(new Error('private DB details'));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(
      withRequestContext({ requestId: 'request-1' }, () =>
        new AuditService(persistence).log(entry),
      ),
    ).resolves.toBeUndefined();
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      event: 'audit.persist.failed',
      requestId: 'request-1',
      shopId: 'shop',
      entityId: 'order',
      action: 'CREATE',
    });
  });
  it('redacts credential snapshots without changing the caller object', async () => {
    const persistence = repository();
    const snapshot = {
      name: 'Product',
      nested: { password: 'sensitive', refreshToken: 'sensitive' },
      note: 'Bearer sensitive',
      url: 'https://shop.example/product?access_token=sensitive',
    };
    await new AuditService(persistence).log({ ...entry, newValues: snapshot });
    const saved = persistence.create.mock.calls[0]?.[0].newValues;
    expect(JSON.stringify(saved)).not.toContain('sensitive');
    expect(saved).toMatchObject({ name: 'Product' });
    expect(snapshot.nested.password).toBe('sensitive');
  });
});

describe('fenced rental claims', () => {
  it('allows only one owner for concurrent same-key claims and isolates shops', async () => {
    const { prisma } = claimStore();
    const claims = await Promise.all([
      claimIdempotency(prisma, clock, input),
      claimIdempotency(prisma, clock, input),
    ]);
    expect(claims.map((claim) => claim.state).sort()).toEqual(['CLAIMED', 'IN_PROGRESS']);
    expect(await claimIdempotency(prisma, clock, { ...input, shopId: 'other' })).toMatchObject({
      state: 'CLAIMED',
    });
  });
  it('keeps active claims in progress and rejects a different payload', async () => {
    const { prisma } = claimStore([persistedClaim()]);
    expect(await claimIdempotency(prisma, clock, input)).toEqual({ state: 'IN_PROGRESS' });
    expect(await claimIdempotency(prisma, clock, { ...input, requestHash: 'different' })).toEqual({
      state: 'HASH_MISMATCH',
    });
  });
  it('recovers a stale claim at the lease boundary and fences the old executor and cleanup', async () => {
    const store = claimStore([
      persistedClaim({ createdAt: new Date(now.getTime() - RENTAL_CLAIM_LEASE_MS) }),
    ]);
    const prisma = store.prisma;
    const claim = await claimIdempotency(prisma, clock, input);
    expect(claim.state).toBe('CLAIMED');
    if (claim.state !== 'CLAIMED') throw new Error('Expected owner');
    expect(claim.claimId).not.toBe('old-claim');
    const old = { scope: input.scope, key: input.key, claimId: 'old-claim' };
    await expect(lockRentalClaim(prisma, input.shopId, old)).rejects.toBeInstanceOf(
      RentalClaimLostError,
    );
    await releaseIdempotency(prisma, input.shopId, input.scope, input.key, old.claimId);
    expect([...store.records.values()][0]?.id).toBe(claim.claimId);
    await expect(
      lockRentalClaim(prisma, input.shopId, { ...old, claimId: claim.claimId }),
    ).resolves.toBeUndefined();
  });
  it('does not reclaim a completed result even if its creation time is stale', async () => {
    const store = claimStore([
      persistedClaim({ createdAt: new Date(0), completedAt: now, responseCode: 201 }),
    ]);
    const prisma = store.prisma;
    expect(await claimIdempotency(prisma, clock, input)).toEqual({
      state: 'COMPLETED',
      responseBody: null,
    });
    expect(store.update.mock.calls).toHaveLength(0);
    expect(await claimIdempotency(prisma, clock, { ...input, requestHash: 'different' })).toEqual({
      state: 'HASH_MISMATCH',
    });
  });
  it('rechecks completion when a competing executor wins before stale recovery', async () => {
    const store = claimStore([persistedClaim({ createdAt: new Date(0) })]);
    const prisma = store.prisma;
    store.update.mockImplementationOnce(() => {
      for (const record of store.records.values()) record.completedAt = now;
      return Promise.resolve({ count: 0 });
    });
    expect(await claimIdempotency(prisma, clock, input)).toEqual({
      state: 'COMPLETED',
      responseBody: null,
    });
  });
  it('permits key reuse only after existing retention expires', async () => {
    const { prisma } = claimStore([persistedClaim({ completedAt: now, expiresAt: now })]);
    expect(await claimIdempotency(prisma, clock, { ...input, requestHash: 'new' })).toMatchObject({
      state: 'CLAIMED',
    });
  });
  it('bounds repeated disappearance under contention', async () => {
    const store = claimStore([persistedClaim()]);
    const prisma = store.prisma;
    store.find.mockResolvedValue(null);
    expect(await claimIdempotency(prisma, clock, input)).toEqual({ state: 'IN_PROGRESS' });
    expect(store.create.mock.calls).toHaveLength(3);
  });
});

function bookingInput(): CreateRentalOrderData {
  return {
    shopId: 'shop',
    orderNumber: 'RT-1',
    customerId: 'customer',
    rentalStartAt: now,
    rentalEndAt: new Date(now.getTime() + 86400000),
    discountTotal: 0,
    createdBy: 'member',
    lines: [],
    charges: [],
    idempotency: { scope: input.scope, key: input.key, claimId: 'old-claim' },
  };
}
function bookingTransaction(prisma: PrismaService) {
  const tx = new PrismaService();
  const order = orderDetails();
  const transaction = jest
    .spyOn(prisma, '$transaction')
    .mockImplementation((operation) => operation(tx));
  const claim = jest.spyOn(tx.idempotencyRecord, 'updateMany').mockResolvedValue({ count: 1 });
  const create = jest.spyOn(tx.rentalOrder, 'create').mockResolvedValue({
    ...order,
    rentalSubtotal: new Prisma.Decimal(50000),
    chargesTotal: new Prisma.Decimal(0),
    discountTotal: new Prisma.Decimal(0),
    depositRequired: new Prisma.Decimal(200000),
    grandTotal: new Prisma.Decimal(50000),
    metadata: null,
  });
  const detail = jest.spyOn(tx.rentalOrder, 'findFirst').mockResolvedValue({
    ...order,
    rentalSubtotal: new Prisma.Decimal(50000),
    chargesTotal: new Prisma.Decimal(0),
    discountTotal: new Prisma.Decimal(0),
    depositRequired: new Prisma.Decimal(200000),
    grandTotal: new Prisma.Decimal(50000),
    metadata: null,
  });
  const history = jest.spyOn(tx.rentalOrderStatusHistory, 'create').mockResolvedValue({
    id: 'history',
    shopId: 'shop',
    orderId: 'order',
    fromStatus: null,
    toStatus: 'RESERVED',
    reason: null,
    note: null,
    changedBy: 'member',
    changedAt: now,
  });
  const outbox = jest.spyOn(tx.outboxEvent, 'create').mockResolvedValue({
    id: 'event',
    shopId: 'shop',
    eventType: 'RENTAL_ORDER_CREATED',
    aggregateType: 'rental_order',
    aggregateId: 'order',
    payload: { orderId: 'order' },
    status: 'PENDING',
    availableAt: now,
    attemptCount: 0,
    lastError: null,
    createdAt: now,
    processedAt: null,
  });
  return { tx, transaction, claim, create, detail, history, outbox };
}

describe('booking transaction ordering and failure propagation', () => {
  it('rejects disallowed collateral methods and document types before persistence', async () => {
    const prisma = new PrismaService();
    const transaction = jest.spyOn(prisma, '$transaction');
    await expect(
      createOrder(
        prisma,
        { ...bookingInput(), collateral: { method: 'DOCUMENT', documentType: 'CCCD' } },
        {
          ...DEFAULT_RENTAL_POLICY,
          deposit: { ...DEFAULT_RENTAL_POLICY.deposit, allowedMethods: ['CASH'] },
        },
      ),
    ).rejects.toMatchObject({ code: 'COLLATERAL_METHOD_NOT_ALLOWED' });
    await expect(
      createOrder(
        prisma,
        { ...bookingInput(), collateral: { method: 'DOCUMENT', documentType: 'GPLX' } },
        {
          ...DEFAULT_RENTAL_POLICY,
          deposit: { ...DEFAULT_RENTAL_POLICY.deposit, allowedDocumentTypes: ['CCCD'] },
        },
      ),
    ).rejects.toMatchObject({ code: 'COLLATERAL_DOCUMENT_TYPE_NOT_ALLOWED' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('locks ownership before writing, then completes after outbox on the same transaction', async () => {
    const prisma = new PrismaService();
    const tx = bookingTransaction(prisma);
    const result = await createOrder(prisma, bookingInput(), DEFAULT_RENTAL_POLICY);
    expect(result?.id).toBe('order');
    expect(tx.claim.mock.calls).toHaveLength(2);
    expect(tx.claim.mock.invocationCallOrder[0]).toBeLessThan(
      tx.create.mock.invocationCallOrder[0]!,
    );
    expect(tx.outbox.mock.invocationCallOrder[0]).toBeLessThan(
      tx.claim.mock.invocationCallOrder[1]!,
    );
    expect(tx.claim.mock.calls[1]?.[0].data).toMatchObject({
      responseCode: 201,
      responseBody: { id: 'order', grandTotal: '50000', rentalStartAt: now.toISOString() },
    });
    expect(tx.transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: 'Serializable' });
  });
  it('rejects a fenced executor before any order or outbox write', async () => {
    const prisma = new PrismaService();
    const tx = bookingTransaction(prisma);
    tx.claim.mockResolvedValue({ count: 0 });
    await expect(createOrder(prisma, bookingInput(), DEFAULT_RENTAL_POLICY)).rejects.toBeInstanceOf(
      RentalClaimLostError,
    );
    expect(tx.create.mock.calls).toHaveLength(0);
    expect(tx.outbox.mock.calls).toHaveLength(0);
  });
  it('propagates outbox failure to the transaction without completing the claim', async () => {
    const prisma = new PrismaService();
    const tx = bookingTransaction(prisma);
    const failure = new Error('outbox unavailable');
    tx.outbox.mockRejectedValue(failure);
    await expect(createOrder(prisma, bookingInput(), DEFAULT_RENTAL_POLICY)).rejects.toBe(failure);
    expect(tx.claim.mock.calls).toHaveLength(1);
  });
  it('does not write an event if the order insert fails', async () => {
    const prisma = new PrismaService();
    const tx = bookingTransaction(prisma);
    const failure = new Error('order unavailable');
    tx.create.mockRejectedValue(failure);
    await expect(createOrder(prisma, bookingInput(), DEFAULT_RENTAL_POLICY)).rejects.toBe(failure);
    expect(tx.outbox.mock.calls).toHaveLength(0);
  });
  it('rejects completion failure rather than committing without replay data', async () => {
    const prisma = new PrismaService();
    const tx = bookingTransaction(prisma);
    tx.claim.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(createOrder(prisma, bookingInput(), DEFAULT_RENTAL_POLICY)).rejects.toBeInstanceOf(
      RentalClaimLostError,
    );
    expect(tx.outbox.mock.calls).toHaveLength(1);
  });
});

function repositoryFake(): jest.Mocked<RentalRepository> {
  return {
    confirm: jest.fn(),
    customerExists: jest.fn().mockResolvedValue(true),
    locationExists: jest.fn().mockResolvedValue(true),
    getBookableVariant: jest.fn(),
    createOrder: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    getStatus: jest.fn(),
    getSchedule: jest.fn(),
    transition: jest.fn(),
    reschedule: jest.fn(),
    addCharge: jest.fn(),
    returnCollateral: jest.fn(),
    claimIdempotency: jest.fn(),
    releaseIdempotency: jest.fn().mockResolvedValue(undefined),
  };
}
const requestInput = (): CreateRentalOrderInput => ({
  customerId: 'customer',
  rentalStartAt: now.toISOString(),
  rentalEndAt: new Date(now.getTime() + 86400000).toISOString(),
  discountTotal: 0,
  items: [],
  charges: [],
});

describe('application idempotent execution and audit', () => {
  it('returns the committed order when the audit storage fails', async () => {
    const repository = repositoryFake();
    repository.createOrder.mockResolvedValue(orderDetails());
    const auditRepository: jest.Mocked<AuditRepository> = {
      create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
      list: jest.fn(),
    };
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(
      new RentalService(repository, new AuditService(auditRepository), clock).create(
        user,
        requestInput(),
      ),
    ).resolves.toMatchObject({ id: 'order' });
    expect(repository.createOrder.mock.calls).toHaveLength(1);
    expect(auditRepository.create.mock.calls[0]?.[0]).toMatchObject(entry);
  });

  it('executes once for concurrent requests, replays the serialized response and audits once', async () => {
    const { prisma } = claimStore();
    const repository = repositoryFake();
    repository.claimIdempotency.mockImplementation((data) => claimIdempotency(prisma, clock, data));
    repository.createOrder.mockImplementation(async (data) => {
      if (!data.idempotency) throw new Error('Expected claim');
      await lockRentalClaim(prisma, data.shopId, data.idempotency);
      await completeRentalClaim(prisma, data.shopId, data.idempotency, orderDetails());
      return orderDetails();
    });
    const audit: jest.Mocked<AuditPort> = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new RentalService(repository, audit, clock);
    const outcomes = await Promise.allSettled([
      service.create(user, requestInput(), 'key'),
      service.create(user, requestInput(), 'key'),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(repository.createOrder.mock.calls).toHaveLength(1);
    const replay = await service.create(user, requestInput(), 'key');
    expect(JSON.stringify(replay)).toBe(JSON.stringify(orderDetails()));
    expect(repository.createOrder.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]?.[0]).toMatchObject(entry);
  });
  it('passes the owner token to cleanup and keeps the original conflict if cleanup fails', async () => {
    const repository = repositoryFake();
    repository.claimIdempotency.mockResolvedValue({ state: 'CLAIMED', claimId: 'owner' });
    repository.createOrder.mockRejectedValue(new RentalClaimLostError());
    repository.releaseIdempotency.mockRejectedValue(new Error('cleanup unavailable'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const audit: jest.Mocked<AuditPort> = { log: jest.fn() };
    await expect(
      new RentalService(repository, audit, clock).create(user, requestInput(), 'key'),
    ).rejects.toMatchObject({ status: 409 });
    expect(repository.releaseIdempotency.mock.calls[0]).toEqual([
      'shop',
      'rental-order.create',
      'key',
      'owner',
    ]);
    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
