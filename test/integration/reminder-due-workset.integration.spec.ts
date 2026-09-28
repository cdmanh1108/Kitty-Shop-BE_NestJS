import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaReminderRepository } from '../../src/modules/reminders/infrastructure/prisma-reminder.repository';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestCustomer, createTestShop, uniqueCode } from '../fixtures/test-factories';

const now = new Date('2026-09-22T03:00:00.000Z');
const dayStart = new Date('2026-09-21T17:00:00.000Z');
const dayEnd = new Date('2026-09-22T17:00:00.000Z');
const returnSoonEnd = new Date('2026-09-23T03:00:00.000Z');

describe('Reminder due workset PostgreSQL regression', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  async function createOrder(
    shopId: string,
    customerId: string,
    data: Partial<Prisma.RentalOrderUncheckedCreateInput> = {},
  ) {
    return prisma.rentalOrder.create({
      data: {
        shopId,
        customerId,
        orderNumber: uniqueCode('REM'),
        source: 'OFFLINE',
        rentalStartAt: new Date('2026-09-01T03:00:00.000Z'),
        rentalEndAt: new Date('2026-09-02T03:00:00.000Z'),
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        depositStatus: 'NOT_REQUIRED',
        depositRequired: 0,
        grandTotal: 100000,
        ...data,
      },
    });
  }

  it('pages only the due-workset, excluding settled historical orders without skips or duplicates', async () => {
    const shop = await createTestShop(prisma);
    const customer = await createTestCustomer(prisma, shop.id);
    const otherShop = await createTestShop(prisma);
    const otherCustomer = await createTestCustomer(prisma, otherShop.id);

    await prisma.rentalOrder.createMany({
      data: Array.from({ length: 300 }, (_, index) => ({
        shopId: shop.id,
        customerId: customer.id,
        orderNumber: uniqueCode(`HISTORY_${index}`),
        source: 'OFFLINE',
        rentalStartAt: new Date('2026-08-01T03:00:00.000Z'),
        rentalEndAt: new Date('2026-08-02T03:00:00.000Z'),
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        depositStatus: 'NOT_REQUIRED',
        depositRequired: 0,
        grandTotal: 100000,
      })),
    });

    const expected = await Promise.all([
      createOrder(shop.id, customer.id, {
        status: 'COMPLETED',
        paymentStatus: 'UNPAID',
      }),
      createOrder(shop.id, customer.id, {
        status: 'RESERVED',
        rentalStartAt: new Date('2026-09-22T05:00:00.000Z'),
        rentalEndAt: new Date('2026-09-25T03:00:00.000Z'),
        paymentStatus: 'PAID',
        depositStatus: 'HELD',
      }),
      createOrder(shop.id, customer.id, {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        depositStatus: 'HELD',
        rentalEndAt: new Date('2026-09-22T08:00:00.000Z'),
      }),
      createOrder(shop.id, customer.id, {
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        depositStatus: 'HELD',
        rentalEndAt: new Date('2026-09-23T01:00:00.000Z'),
      }),
      createOrder(shop.id, customer.id, {
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        depositStatus: 'HELD',
        rentalEndAt: new Date('2026-09-22T02:59:59.999Z'),
      }),
      createOrder(shop.id, customer.id, {
        status: 'RESERVED',
        paymentStatus: 'PAID',
        depositStatus: 'PENDING',
        depositRequired: 100000,
      }),
      createOrder(shop.id, customer.id, {
        status: 'CONFIRMED',
        rentalStartAt: new Date('2026-09-22T05:00:00.000Z'),
        rentalEndAt: new Date('2026-09-25T03:00:00.000Z'),
        paymentStatus: 'UNPAID',
        depositStatus: 'PARTIALLY_HELD',
        depositRequired: 100000,
      }),
    ]);
    await createOrder(otherShop.id, otherCustomer.id, {
      status: 'COMPLETED',
      paymentStatus: 'UNPAID',
    });

    const repository = new PrismaReminderRepository(prisma);
    const ids: string[] = [];
    const pages: string[][] = [];
    let cursor: string | undefined;
    do {
      const page = await repository.candidatePage({
        shopId: shop.id,
        now,
        dayStart,
        dayEnd,
        returnSoonEnd,
        cursor,
        limit: 2,
      });
      pages.push(page.items.map((item) => item.id));
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(pages).toHaveLength(4);
    expect(ids).toHaveLength(expected.length);
    expect(new Set(ids).size).toBe(expected.length);
    expect(ids.sort()).toEqual(expected.map((order) => order.id).sort());
  });
});
