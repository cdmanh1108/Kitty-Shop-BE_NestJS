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

    await repository.resolveMissing('shop-1', ['PAYMENT_DUE:order-1:2026-09-22']);

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
});
