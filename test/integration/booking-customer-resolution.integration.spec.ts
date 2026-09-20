import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { BookingCustomerUnavailableError } from '../../src/modules/customers/domain/customer-errors';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';
import { createTestCustomer, createTestShop } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Booking customer resolution', () => {
  let prisma: PrismaService;
  let repository: PrismaCustomerRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    repository = new PrismaCustomerRepository(prisma);
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  it('reuses only an active unarchived customer without overwriting profile fields', async () => {
    const shop = await createTestShop(prisma);
    const otherShop = await createTestShop(prisma);
    const existing = await createTestCustomer(prisma, shop.id, {
      fullName: 'Original customer',
      phone: '0912345678',
      normalizedPhone: '0912345678',
      email: 'original@example.test',
      facebook: 'original-social',
      source: 'ADMIN',
    });

    await expect(
      repository.resolveForBooking({
        shopId: shop.id,
        fullName: 'Guest supplied name',
        phone: '+84 912 345 678',
        email: 'guest@example.test',
        facebook: 'guest-social',
      }),
    ).resolves.toEqual({ id: existing.id });

    await expect(
      prisma.customer.findUniqueOrThrow({ where: { id: existing.id } }),
    ).resolves.toMatchObject({
      fullName: 'Original customer',
      phone: '0912345678',
      normalizedPhone: '0912345678',
      email: 'original@example.test',
      facebook: 'original-social',
      source: 'ADMIN',
      status: 'ACTIVE',
      archivedAt: null,
    });

    const otherResolution = await repository.resolveForBooking({
      shopId: otherShop.id,
      fullName: 'Other shop customer',
      phone: '0912 345 678',
    });
    expect(otherResolution.id).not.toBe(existing.id);
    await expect(prisma.customer.count({ where: { normalizedPhone: '0912345678' } })).resolves.toBe(
      2,
    );
  });

  it('rejects archived and blocked profiles that own the normalized phone key', async () => {
    const shop = await createTestShop(prisma);
    await createTestCustomer(prisma, shop.id, {
      phone: '0912345678',
      normalizedPhone: '0912345678',
      archivedAt: new Date('2026-09-20T00:00:00.000Z'),
    });
    await createTestCustomer(prisma, shop.id, {
      phone: '0987654321',
      normalizedPhone: '0987654321',
      status: 'BLOCKED',
    });

    await expect(
      repository.resolveForBooking({
        shopId: shop.id,
        fullName: 'Guest',
        phone: '+84 912 345 678',
      }),
    ).rejects.toBeInstanceOf(BookingCustomerUnavailableError);
    await expect(
      repository.resolveForBooking({ shopId: shop.id, fullName: 'Guest', phone: '0987 654 321' }),
    ).rejects.toBeInstanceOf(BookingCustomerUnavailableError);
    await expect(prisma.customer.count({ where: { shopId: shop.id } })).resolves.toBe(2);
  });

  it('converges two forced find-then-create contenders on one normalized-phone identity', async () => {
    const shop = await createTestShop(prisma);
    let arrivals = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    const customer = {
      create: prisma.customer.create.bind(prisma.customer),
      findFirst: async (...args: Parameters<typeof prisma.customer.findFirst>) => {
        const found = await prisma.customer.findFirst(...args);
        if (found) return found;
        arrivals += 1;
        if (arrivals === 2) releaseBarrier();
        await barrier;
        return found;
      },
    };
    const contestedRepository = new PrismaCustomerRepository({ customer } as PrismaService);

    const [first, second] = await Promise.all([
      contestedRepository.resolveForBooking({
        shopId: shop.id,
        fullName: 'First guest',
        phone: '0912 345 678',
      }),
      contestedRepository.resolveForBooking({
        shopId: shop.id,
        fullName: 'Second guest',
        phone: '+84 912 345 678',
      }),
    ]);

    expect(first.id).toBe(second.id);
    await expect(
      prisma.customer.findMany({ where: { shopId: shop.id, normalizedPhone: '0912345678' } }),
    ).resolves.toHaveLength(1);
  });
});
