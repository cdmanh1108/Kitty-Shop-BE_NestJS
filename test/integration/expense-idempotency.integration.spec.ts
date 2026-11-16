import type { CurrentUser } from '../../src/common/types/current-user';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { FinanceService } from '../../src/modules/finance/application/finance.service';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { FinanceExpenseClaimLostError } from '../../src/modules/finance/domain/expense-idempotency';
import { createTestShop, createTestUserAndMember, uniqueCode } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Expense creation idempotency with PostgreSQL', () => {
  let prisma: PrismaService;
  let now: Date;
  let repository: PrismaFinanceRepository;
  let finance: FinanceService;
  const clock = { now: () => new Date(now) };

  beforeAll(async () => {
    prisma = await connectTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
    now = new Date('2026-11-16T08:00:00.000Z');
    repository = new PrismaFinanceRepository(prisma, clock);
    finance = new FinanceService(
      repository,
      { log: jest.fn().mockResolvedValue(undefined) },
      clock,
    );
  });
  afterAll(disconnectTestDatabase);

  async function fixture() {
    const shop = await createTestShop(prisma);
    const identity = await createTestUserAndMember(prisma, shop.id);
    const category = await prisma.expenseCategory.create({
      data: { shopId: shop.id, code: uniqueCode('EXP'), name: 'Giặt hấp' },
    });
    const user: CurrentUser = {
      shopId: shop.id,
      memberId: identity.member.id,
      userId: identity.user.id,
      email: identity.user.email,
      fullName: identity.user.fullName,
      permissions: ['finance.manage'],
    };
    const input = {
      categoryId: category.id,
      amount: 100000,
      description: 'Giặt đồ',
      expenseDate: '2026-11-16',
    };
    return { user, category, input };
  }

  it('replays a lost response as exactly one expense and one durable CREATE audit', async () => {
    const { user, input, category } = await fixture();
    const first = await finance.createExpense(user, input, 'lost-response');
    now = new Date(now.getTime() + 60_000);
    await prisma.expenseCategory.update({ where: { id: category.id }, data: { isActive: false } });
    await finance.voidExpense(user, first.id);
    const replay = await finance.createExpense(
      user,
      { ...input, description: '  Giặt đồ  ' },
      'lost-response',
    );
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ amount: '100000', status: 'PAID', expenseDate: '2026-11-16' });
    expect(await prisma.expense.count()).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'expense', action: 'CREATE', entityId: first.id },
      }),
    ).toBe(1);
    expect(await prisma.idempotencyRecord.count({ where: { completedAt: { not: null } } })).toBe(1);
  });

  it('allows intentionally identical expenses with new keys and rejects payload drift on an existing key', async () => {
    const { user, input } = await fixture();
    const first = await finance.createExpense(user, input, 'intent-one');
    const second = await finance.createExpense(user, input, 'intent-two');
    expect(second.id).not.toBe(first.id);
    for (const changed of [
      { ...input, categoryId: '00000000-0000-4000-8000-000000000001' },
      { ...input, description: 'Chi phí khác' },
      { ...input, orderId: '00000000-0000-4000-8000-000000000002' },
      { ...input, inventoryItemId: '00000000-0000-4000-8000-000000000003' },
      { ...input, amount: 100001 },
      { ...input, expenseDate: '2026-11-17' },
      { ...input, vendorName: 'Nhà cung cấp khác' },
      { ...input, paymentMethod: 'BANK_TRANSFER' },
      { ...input, receiptUrl: 'https://example.test/receipt.jpg' },
    ]) {
      await expect(finance.createExpense(user, changed, 'intent-one')).rejects.toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    expect(await prisma.expense.count()).toBe(2);
    expect(
      await prisma.auditLog.count({ where: { entityType: 'expense', action: 'CREATE' } }),
    ).toBe(2);
  });

  it('canonicalizes equivalent paidAt instants without changing an omitted timestamp on retry', async () => {
    const { user, input } = await fixture();
    const first = await finance.createExpense(
      user,
      { ...input, paidAt: '2026-11-16T15:00:00+07:00' },
      'instant',
    );
    expect(
      await finance.createExpense(user, { ...input, paidAt: '2026-11-16T08:00:00Z' }, 'instant'),
    ).toEqual(first);
    await expect(finance.createExpense(user, input, 'instant')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(await prisma.expense.count()).toBe(1);
  });

  it('isolates keys by authenticated staff member and shop', async () => {
    const one = await fixture();
    const first = await finance.createExpense(one.user, one.input, 'same-key');
    const staff = await createTestUserAndMember(prisma, one.user.shopId);
    const otherUser = { ...one.user, userId: staff.user.id, memberId: staff.member.id };
    const second = await finance.createExpense(otherUser, one.input, 'same-key');
    const two = await fixture();
    const third = await finance.createExpense(two.user, two.input, 'same-key');
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(await prisma.expense.count({ where: { shopId: one.user.shopId } })).toBe(2);
    expect(await prisma.expense.count({ where: { shopId: two.user.shopId } })).toBe(1);
  });

  it('keeps simultaneous submissions on the same key to one committed expense', async () => {
    const { user, input } = await fixture();
    const results = await Promise.allSettled([
      finance.createExpense(user, input, 'parallel'),
      finance.createExpense(user, input, 'parallel'),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    const replay = await finance.createExpense(user, input, 'parallel');
    expect(await prisma.expense.findMany({ select: { id: true } })).toEqual([{ id: replay.id }]);
    expect(
      await prisma.auditLog.count({ where: { entityType: 'expense', action: 'CREATE' } }),
    ).toBe(1);
  });

  it.each(['audit', 'completion'] as const)(
    'rolls back expense, audit and completion when %s fails',
    async (failure) => {
      const { user, input } = await fixture();
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION test_expense_write_failure() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'synthetic expense write failure'; END; $$ LANGUAGE plpgsql`,
      );
      try {
        if (failure === 'audit') {
          await prisma.$executeRawUnsafe(
            `CREATE TRIGGER test_expense_failure BEFORE INSERT ON audit_logs FOR EACH ROW WHEN (NEW.entity_type = 'expense') EXECUTE FUNCTION test_expense_write_failure()`,
          );
        } else {
          await prisma.$executeRawUnsafe(
            `CREATE TRIGGER test_expense_failure BEFORE UPDATE ON idempotency_records FOR EACH ROW WHEN (NEW.completed_at IS NOT NULL) EXECUTE FUNCTION test_expense_write_failure()`,
          );
        }
        await expect(finance.createExpense(user, input, 'rollback')).rejects.toBeDefined();
        expect(await prisma.expense.count()).toBe(0);
        expect(await prisma.auditLog.count({ where: { entityType: 'expense' } })).toBe(0);
        expect(
          await prisma.idempotencyRecord.count({ where: { completedAt: { not: null } } }),
        ).toBe(0);
      } finally {
        await prisma.$executeRawUnsafe('DROP FUNCTION test_expense_write_failure() CASCADE');
      }
      await finance.createExpense(user, input, 'rollback');
      expect(await prisma.expense.count()).toBe(1);
    },
  );

  it('fences a stale owner before any write and prevents its cleanup from deleting a successor', async () => {
    const { user, input } = await fixture();
    const claimInput = {
      shopId: user.shopId,
      scope: `finance.expense.create.v1:${user.memberId}`,
      key: 'stale',
      requestHash: 'fixed-test-command',
      expiresAt: new Date(now.getTime() + 86400000),
    };
    const old = await repository.claimExpenseIdempotency(claimInput);
    if (old.state !== 'CLAIMED') throw new Error('Expected initial claim');
    now = new Date(now.getTime() + 300001);
    const current = await repository.claimExpenseIdempotency(claimInput);
    if (current.state !== 'CLAIMED') throw new Error('Expected recovered claim');
    const data = {
      ...input,
      shopId: user.shopId,
      createdBy: user.memberId,
      expenseNumber: uniqueCode('EXP'),
      expenseDate: new Date('2026-11-16T00:00:00Z'),
      audit: { actorUserId: user.userId, actorMemberId: user.memberId },
      idempotency: { scope: claimInput.scope, key: claimInput.key, claimId: old.claimId },
    };
    await expect(repository.createExpense(data)).rejects.toBeInstanceOf(
      FinanceExpenseClaimLostError,
    );
    await repository.releaseExpenseIdempotency(
      user.shopId,
      claimInput.scope,
      claimInput.key,
      old.claimId,
    );
    expect(
      await prisma.idempotencyRecord.findUnique({ where: { id: current.claimId } }),
    ).not.toBeNull();
    expect(await prisma.expense.count()).toBe(0);
    await repository.createExpense({
      ...data,
      idempotency: { ...data.idempotency, claimId: current.claimId },
    });
    expect(await prisma.expense.count()).toBe(1);
  });
});
