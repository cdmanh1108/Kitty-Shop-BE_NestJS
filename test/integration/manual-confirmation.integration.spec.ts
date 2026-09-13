import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { RentalConfirmationService } from '../../src/modules/rentals/application/rental-confirmation.service';
import type { ObjectStoragePort } from '../../src/common/storage/object-storage.port';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { fixedClock, rentalScenario } from '../fixtures/rental.fixture';
import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { createTestShop } from '../fixtures/test-factories';
import { withRequestContext } from '../../src/common/request-context/request-context';

describe('Atomic manual rental confirmation', () => {
  let prisma: PrismaService;
  let repository: PrismaRentalRepository;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    repository = new PrismaRentalRepository(prisma, fixedClock, rentalPolicies);
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(disconnectTestDatabase);

  async function fixture() {
    const f = await rentalScenario(prisma);
    const order = await repository.createOrder(f.data);
    if (!order) throw new Error('Missing order');
    const user = { ...f.principal, permissions: [...f.principal.permissions, 'rentals.confirm'] };
    const objects = new Map<string, Uint8Array>();
    const storage: ObjectStoragePort = {
      putObject: (input) => {
        objects.set(input.key, input.body);
        return Promise.resolve({ storageKey: input.key, publicUrl: '' });
      },
      getObject: (key) => {
        const body = objects.get(key);
        if (!body) return Promise.reject(new Error('Missing evidence'));
        return Promise.resolve(body);
      },
      deleteObject: (key) => {
        objects.delete(key);
        return Promise.resolve();
      },
      headObject: () => Promise.resolve(null),
      getPublicUrl: () => '',
    };
    const service = new RentalConfirmationService(repository, rentalPolicies, storage);
    return { ...f, order, user, objects, service };
  }

  it.each(['CASH', 'CCCD', 'GPLX'] as const)(
    'confirms %s without payments or evidence and persists actor/audit',
    async (type) => {
      const f = await fixture();
      const input =
        type === 'CASH'
          ? { collateralMethod: 'CASH' as const, collateralAmount: 200000 }
          : { collateralMethod: 'DOCUMENT' as const, documentType: type };
      const confirmed = await withRequestContext({ requestId: 'confirm-request' }, () =>
        f.service.confirm(f.user, f.order.id, { ...input, note: 'Đã nhận tại cửa hàng' }),
      );
      expect(confirmed.status).toBe('CONFIRMED');
      expect(confirmed.collateralStatus).toBe('HELD');
      expect(confirmed.confirmation).toMatchObject({
        confirmedAt: fixedClock.now(),
        confirmedBy: f.member.id,
        actorUserId: f.user.userId,
        note: 'Đã nhận tại cửa hàng',
        evidenceKey: null,
      });
      expect(await prisma.paymentTransaction.count()).toBe(0);
      expect(confirmed.paymentStatus).toBe('UNPAID');
      expect(await prisma.auditLog.findFirst({ where: { entityId: f.order.id } })).toMatchObject({
        requestId: 'confirm-request',
        action: 'RENTAL_ORDER_CONFIRMED',
        actorMemberId: f.member.id,
      });
      expect(
        confirmed.items.every(
          (item) =>
            item.status === 'CONFIRMED' && item.allocations.every((a) => a.status === 'CONFIRMED'),
        ),
      ).toBe(true);
      await expect(f.service.confirm(f.user, f.order.id, input)).rejects.toThrow();
      expect(await prisma.rentalConfirmation.count()).toBe(1);
      expect(await prisma.auditLog.count()).toBe(1);
      expect(
        await prisma.outboxEvent.count({ where: { eventType: 'RENTAL_ORDER_CONFIRMED' } }),
      ).toBe(1);
    },
  );

  const image = {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    originalname: 'receipt.jpg',
    mimetype: 'image/jpeg',
  };
  it('stores only evidence metadata and serves the uploaded bytes to an authorized same-shop actor', async () => {
    const f = await fixture();
    const result = await f.service.confirm(
      f.user,
      f.order.id,
      { collateralMethod: 'CASH', collateralAmount: 200000 },
      image,
    );
    expect(result.confirmation).toMatchObject({
      evidenceFilename: 'receipt.jpg',
      evidenceMimeType: 'image/jpeg',
      evidenceSize: image.buffer.length,
    });
    expect(result.confirmation?.evidenceKey).toContain(
      `private/rental-confirmations/${f.shop.id}/${f.order.id}/`,
    );
    expect((await f.service.evidence(f.user, f.order.id)).body).toEqual(image.buffer);
    await expect(
      f.service.evidence({ ...f.user, permissions: [] }, f.order.id),
    ).rejects.toMatchObject({ status: 403 });
    const other = await createTestShop(prisma);
    await expect(
      f.service.evidence({ ...f.user, shopId: other.id }, f.order.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('has one winner under concurrent confirms and creates one audit/history/evidence', async () => {
    const f = await fixture();
    const input = { collateralMethod: 'CASH' as const, collateralAmount: 200000 };
    const results = await Promise.allSettled([
      f.service.confirm(f.user, f.order.id, input, image),
      f.service.confirm(f.user, f.order.id, input, image),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.rentalConfirmation.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(1);
    expect(await prisma.rentalOrderStatusHistory.count({ where: { toStatus: 'CONFIRMED' } })).toBe(
      1,
    );
    expect(f.objects.size).toBe(1);
  });

  it('retains referenced evidence when the commit succeeds but its response is lost', async () => {
    const f = await fixture();
    const confirm = repository.confirm.bind(repository);
    jest.spyOn(repository, 'confirm').mockImplementationOnce(async (input) => {
      await confirm(input);
      throw new Error('Lost commit response');
    });
    await expect(
      f.service.confirm(
        f.user,
        f.order.id,
        { collateralMethod: 'CASH', collateralAmount: 200000 },
        image,
      ),
    ).rejects.toThrow('Lost commit response');
    expect((await repository.get(f.shop.id, f.order.id))?.status).toBe('CONFIRMED');
    expect(f.objects.size).toBe(1);
    expect((await f.service.evidence(f.user, f.order.id)).body).toEqual(image.buffer);
  });

  it.each(['audit_logs', 'outbox_events'] as const)(
    'rolls back all confirmation state when %s persistence fails and cleans upload',
    async (table) => {
      const f = await fixture();
      const column = table === 'audit_logs' ? 'action' : 'event_type';
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${table}" ADD CONSTRAINT fail_confirmation_test CHECK (${column} <> 'RENTAL_ORDER_CONFIRMED')`,
      );
      try {
        await expect(
          f.service.confirm(
            f.user,
            f.order.id,
            { collateralMethod: 'CASH', collateralAmount: 200000 },
            image,
          ),
        ).rejects.toThrow();
        const current = await repository.get(f.shop.id, f.order.id);
        expect(current?.status).toBe('RESERVED');
        expect(current?.collateralStatus).toBe('REQUIRED');
        expect(current?.confirmation).toBeNull();
        expect(current?.items[0]?.allocations[0]?.status).toBe('HELD');
        expect(await prisma.auditLog.count()).toBe(0);
        expect(
          await prisma.rentalOrderStatusHistory.count({ where: { toStatus: 'CONFIRMED' } }),
        ).toBe(0);
        expect(f.objects.size).toBe(0);
      } finally {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${table}" DROP CONSTRAINT fail_confirmation_test`,
        );
      }
    },
  );

  it('rejects insufficient cash, invalid evidence, permissions, tenant and state before mutation', async () => {
    const f = await fixture();
    await expect(
      f.service.confirm({ ...f.user, permissions: ['rentals.update'] }, f.order.id, {
        collateralMethod: 'CASH',
        collateralAmount: 200000,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.service.confirm(f.user, f.order.id, { collateralMethod: 'CASH', collateralAmount: 1 }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_COLLATERAL' });
    await expect(
      f.service.confirm(
        f.user,
        f.order.id,
        { collateralMethod: 'CASH', collateralAmount: 200000 },
        { ...image, buffer: Buffer.from('<html>') },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      repository.transition({
        shopId: f.shop.id,
        orderId: f.order.id,
        fromStatuses: ['RESERVED'],
        toStatus: 'CONFIRMED',
        changedBy: f.member.id,
      }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    expect(await prisma.rentalConfirmation.count()).toBe(0);
    await repository.transition({
      shopId: f.shop.id,
      orderId: f.order.id,
      fromStatuses: ['RESERVED'],
      toStatus: 'CANCELLED',
      changedBy: f.member.id,
    });
    await expect(
      f.service.confirm(f.user, f.order.id, { collateralMethod: 'CASH', collateralAmount: 200000 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
