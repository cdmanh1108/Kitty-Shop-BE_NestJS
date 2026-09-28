import type { Prisma } from '@prisma/client';
import type { Clock } from '../../src/common/clock/clock';
import type { CurrentUser } from '../../src/common/types/current-user';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { ReminderService } from '../../src/modules/reminders/application/reminder.service';
import type { ReminderRepository } from '../../src/modules/reminders/domain/reminder.repository';
import { PrismaReminderRefreshCoordinator } from '../../src/modules/reminders/infrastructure/prisma-reminder-refresh.coordinator';
import { PrismaReminderRepository } from '../../src/modules/reminders/infrastructure/prisma-reminder.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
  testDatabaseUrl,
} from '../helpers/test-database';
import { createTestCustomer, createTestShop, uniqueCode } from '../fixtures/test-factories';

const now = new Date('2026-09-22T03:00:00.000Z');
const clock: Clock = { now: () => new Date(now) };

class Deferred<T = void> {
  readonly promise: Promise<T>;
  resolve!: (value: T | PromiseLike<T>) => void;

  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolve = resolve;
    });
  }
}

function withBlockedFirstPage(
  delegate: ReminderRepository,
  entered: Deferred,
  release: Deferred,
): ReminderRepository {
  let firstPage = true;
  return {
    activeShops: () => delegate.activeShops(),
    candidatePage: async (input) => {
      const page = await delegate.candidatePage(input);
      if (firstPage) {
        firstPage = false;
        entered.resolve();
        await release.promise;
      }
      return page;
    },
    upsert: (input) => delegate.upsert(input),
    resolveMissing: (shopId, activeKeys) => delegate.resolveMissing(shopId, activeKeys),
    list: (shopId, status) => delegate.list(shopId, status),
    dismiss: (shopId, id, dismissedBy) => delegate.dismiss(shopId, id, dismissedBy),
  };
}

describe('Reminder refresh lease coordination', () => {
  let prisma: PrismaService;
  let additionalClients: PrismaService[];

  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
    additionalClients = [];
  });

  afterEach(async () => {
    await Promise.all(additionalClients.map((client) => client.$disconnect()));
  });

  afterAll(disconnectTestDatabase);

  async function independentClient(): Promise<PrismaService> {
    const client = new PrismaService({ datasources: { db: { url: testDatabaseUrl() } } });
    await client.$connect();
    additionalClients.push(client);
    return client;
  }

  it('allows exactly one independent worker to own the same shop, while different shops can proceed', async () => {
    const workerOne = new PrismaReminderRefreshCoordinator(await independentClient());
    const workerTwo = new PrismaReminderRefreshCoordinator(await independentClient());
    const entered = new Deferred();
    const release = new Deferred();
    let sameShopWork = 0;
    let otherShopWork = 0;

    const first = workerOne.runIfOwner('shop-a', async () => {
      sameShopWork += 1;
      entered.resolve();
      await release.promise;
    });
    await entered.promise;

    const sameShop = await workerTwo.runIfOwner('shop-a', () => {
      sameShopWork += 1;
      return Promise.resolve();
    });
    const otherShop = await workerTwo.runIfOwner('shop-b', () => {
      otherShopWork += 1;
      return Promise.resolve();
    });

    expect(sameShop.acquired).toBe(false);
    expect(otherShop.acquired).toBe(true);
    expect(sameShopWork).toBe(1);
    expect(otherShopWork).toBe(1);

    release.resolve();
    await expect(first).resolves.toMatchObject({ acquired: true });
  });

  it('prevents same-process reentrancy and fences a stale owner after lease expiry', async () => {
    const primaryClient = await independentClient();
    const workerOne = new PrismaReminderRefreshCoordinator(primaryClient);
    const workerTwo = new PrismaReminderRefreshCoordinator(await independentClient());
    const entered = new Deferred();
    const release = new Deferred();

    const first = workerOne.runIfOwner('shop-a', async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const reentrant = await workerOne.runIfOwner('shop-a', () => Promise.resolve(undefined));
    expect(reentrant.acquired).toBe(false);

    await primaryClient.$executeRaw`
      UPDATE "scheduler_job_leases"
      SET "lease_until" = CURRENT_TIMESTAMP - INTERVAL '1 millisecond'
      WHERE "job_key" = 'reminders.refresh:shop-a'
    `;
    const successor = await workerTwo.runIfOwner('shop-a', () => Promise.resolve(undefined));
    expect(successor.acquired).toBe(true);

    release.resolve();
    await expect(first).rejects.toThrow('lease ownership was lost');
  });

  it('releases an owner-token-fenced lease after a callback error', async () => {
    const workerOne = new PrismaReminderRefreshCoordinator(await independentClient());
    const workerTwo = new PrismaReminderRefreshCoordinator(await independentClient());
    const failure = new Error('page two failed');

    await expect(workerOne.runIfOwner('shop-a', async () => Promise.reject(failure))).rejects.toBe(
      failure,
    );
    await expect(
      workerTwo.runIfOwner('shop-a', () => Promise.resolve(undefined)),
    ).resolves.toMatchObject({
      acquired: true,
    });
  });

  it('keeps a second cron worker out of a real multi-page C39 scan until the owner completes', async () => {
    const shop = await createTestShop(prisma);
    const customer = await createTestCustomer(prisma, shop.id);
    await prisma.rentalOrder.createMany({
      data: Array.from(
        { length: 101 },
        (_, index) =>
          ({
            shopId: shop.id,
            customerId: customer.id,
            orderNumber: uniqueCode(`REMINDER_${index}`),
            source: 'OFFLINE',
            rentalStartAt: new Date('2026-09-01T03:00:00.000Z'),
            rentalEndAt: new Date('2026-09-02T03:00:00.000Z'),
            status: 'COMPLETED',
            paymentStatus: 'UNPAID',
            depositStatus: 'NOT_REQUIRED',
            depositRequired: 0,
            grandTotal: 100000,
          }) satisfies Prisma.RentalOrderCreateManyInput,
      ),
    });

    const firstClient = await independentClient();
    const secondClient = await independentClient();
    const firstRepository = new PrismaReminderRepository(firstClient);
    const secondRepository = new PrismaReminderRepository(secondClient);
    const enteredFirstPage = new Deferred();
    const releaseFirstPage = new Deferred();
    const blockedRepository = withBlockedFirstPage(
      firstRepository,
      enteredFirstPage,
      releaseFirstPage,
    );
    const secondCandidatePage = jest.fn(
      (input: Parameters<ReminderRepository['candidatePage']>[0]) =>
        secondRepository.candidatePage(input),
    );
    const secondWorkerRepository: ReminderRepository = {
      activeShops: () => secondRepository.activeShops(),
      candidatePage: secondCandidatePage,
      upsert: (input) => secondRepository.upsert(input),
      resolveMissing: (shopId, activeKeys) => secondRepository.resolveMissing(shopId, activeKeys),
      list: (shopId, status) => secondRepository.list(shopId, status),
      dismiss: (shopId, id, dismissedBy) => secondRepository.dismiss(shopId, id, dismissedBy),
    };
    const user: CurrentUser = {
      userId: 'user-1',
      memberId: 'member-1',
      shopId: shop.id,
      email: null,
      fullName: 'Admin',
      permissions: [],
    };
    const firstService = new ReminderService(
      blockedRepository,
      clock,
      new PrismaReminderRefreshCoordinator(firstClient),
    );
    const secondService = new ReminderService(
      secondWorkerRepository,
      clock,
      new PrismaReminderRefreshCoordinator(secondClient),
    );

    const firstRun = firstService.refreshForUser(user);
    await enteredFirstPage.promise;
    await secondService.refreshAll();

    expect(secondCandidatePage).not.toHaveBeenCalled();

    releaseFirstPage.resolve();
    await firstRun;
    expect(await prisma.reminder.count({ where: { shopId: shop.id } })).toBe(101);

    await secondService.refreshForUser(user);
    expect(secondCandidatePage).toHaveBeenCalledTimes(2);
  });
});
