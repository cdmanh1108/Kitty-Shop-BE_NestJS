import { PrismaReminderRepository } from '../../src/modules/reminders/infrastructure/prisma-reminder.repository';

describe('PrismaReminderRepository lifecycle persistence', () => {
  const input = {
    shopId: 'shop-1',
    orderId: 'order-1',
    customerId: 'customer-1',
    dedupeKey: 'PAYMENT_DUE:order-1:2026-09-22',
    type: 'PAYMENT_DUE',
    scheduledFor: new Date('2026-09-22T03:00:00.000Z'),
    priority: 70,
    title: 'Payment due',
    content: 'Customer',
  };

  it('updates mutable same-event fields without reviving dismissed or resolved lifecycle state', async () => {
    type UpsertArgs = {
      where: unknown;
      create: unknown;
      update: Record<string, unknown>;
    };
    let received: UpsertArgs | undefined;
    const upsert = jest.fn((args: UpsertArgs) => {
      received = args;
      return Promise.resolve({});
    });
    const repository = new PrismaReminderRepository({ reminder: { upsert } } as never);

    await repository.upsert(input);

    expect(upsert).toHaveBeenCalledWith({
      where: { shopId_dedupeKey: { shopId: input.shopId, dedupeKey: input.dedupeKey } },
      create: { ...input, status: 'PENDING' },
      update: {
        type: input.type,
        scheduledFor: input.scheduledFor,
        priority: input.priority,
        title: input.title,
        content: input.content,
      },
    });
    const update = received?.update;
    expect(update).toBeDefined();
    if (!update) {
      throw new Error('Expected the reminder upsert update payload.');
    }
    expect(update).not.toHaveProperty('status');
    expect(update).not.toHaveProperty('processedAt');
    expect(update).not.toHaveProperty('dismissedAt');
    expect(update).not.toHaveProperty('dismissedBy');
  });

  it('only resolves active pending rows that are absent from the refreshed occurrence set', async () => {
    type UpdateManyArgs = {
      where: {
        shopId: string;
        status: string;
        type: { in: string[] };
        dedupeKey?: { notIn: string[] };
      };
      data: { status: string; processedAt: Date };
    };
    let received: UpdateManyArgs | undefined;
    const updateMany = jest.fn((args: UpdateManyArgs) => {
      received = args;
      return Promise.resolve({ count: 1 });
    });
    const repository = new PrismaReminderRepository({ reminder: { updateMany } } as never);

    await expect(
      repository.resolveMissing('shop-1', ['PAYMENT_DUE:order-1:2026-09-22']),
    ).resolves.toBe(1);

    expect(received).toBeDefined();
    if (!received) {
      throw new Error('Expected the reminder resolve payload.');
    }
    expect(received.where.shopId).toBe('shop-1');
    expect(received.where.status).toBe('PENDING');
    expect(received.where.dedupeKey).toEqual({ notIn: ['PAYMENT_DUE:order-1:2026-09-22'] });
    expect(received.data.status).toBe('RESOLVED');
    expect(received.data.processedAt).toBeInstanceOf(Date);
  });

  it('reads a narrow, shop-scoped and bounded due-workset page with an ID keyset cursor', async () => {
    interface CandidateQuery {
      where: { shopId: string; id?: { gt: string }; OR: unknown[] };
      select: Record<string, unknown>;
      orderBy: { id: 'asc' };
      take: number;
    }
    const findMany = jest.fn<Promise<object[]>, [CandidateQuery]>().mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000001',
        orderNumber: 'RT-1',
        status: 'RESERVED',
        paymentStatus: 'PAID',
        depositStatus: 'HELD',
        depositRequired: 0,
        rentalStartAt: new Date('2026-09-22T03:00:00.000Z'),
        rentalEndAt: new Date('2026-09-23T03:00:00.000Z'),
        customerId: 'customer-1',
        customer: { fullName: 'Customer', phone: '0900000000' },
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        orderNumber: 'RT-2',
        status: 'COMPLETED',
        paymentStatus: 'UNPAID',
        depositStatus: 'HELD',
        depositRequired: 0,
        rentalStartAt: new Date('2026-09-20T03:00:00.000Z'),
        rentalEndAt: new Date('2026-09-21T03:00:00.000Z'),
        customerId: 'customer-1',
        customer: { fullName: 'Customer', phone: '0900000000' },
      },
      {
        id: '00000000-0000-4000-8000-000000000003',
        orderNumber: 'RT-3',
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        depositStatus: 'HELD',
        depositRequired: 0,
        rentalStartAt: new Date('2026-09-20T03:00:00.000Z'),
        rentalEndAt: new Date('2026-09-21T03:00:00.000Z'),
        customerId: 'customer-1',
        customer: { fullName: 'Customer', phone: '0900000000' },
      },
    ]);
    const repository = new PrismaReminderRepository({ rentalOrder: { findMany } } as never);
    const dayStart = new Date('2026-09-21T17:00:00.000Z');
    const dayEnd = new Date('2026-09-22T17:00:00.000Z');
    const page = await repository.candidatePage({
      shopId: 'shop-1',
      now: new Date('2026-09-22T03:00:00.000Z'),
      dayStart,
      dayEnd,
      returnSoonEnd: new Date('2026-09-23T03:00:00.000Z'),
      cursor: '00000000-0000-4000-8000-000000000000',
      limit: 2,
    });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('00000000-0000-4000-8000-000000000002');
    const query = findMany.mock.calls[0]?.[0];
    if (!query) throw new Error('Expected a candidate page query');
    expect(query.orderBy).toEqual({ id: 'asc' });
    expect(query.take).toBe(3);
    expect(query.where.shopId).toBe('shop-1');
    expect(query.where.id).toEqual({ gt: '00000000-0000-4000-8000-000000000000' });
    expect(query.where.OR).toHaveLength(4);
    expect(query.select.customer).toEqual({ select: { fullName: true, phone: true } });
    expect(Object.keys(query.select).sort()).toEqual([
      'customer',
      'customerId',
      'depositRequired',
      'depositStatus',
      'id',
      'orderNumber',
      'paymentStatus',
      'rentalEndAt',
      'rentalStartAt',
      'status',
    ]);
  });
});
