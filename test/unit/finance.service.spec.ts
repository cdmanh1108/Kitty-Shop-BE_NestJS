import { FinanceService } from '../../src/modules/finance/application/finance.service';
import type { FinanceRepository } from '../../src/modules/finance/domain/finance.repository';
import type { ExpenseRecord } from '../../src/modules/finance/domain/finance.records';
import { toStoredExpenseCreateResult } from '../../src/modules/finance/domain/expense-idempotency';
import { FinanceInvariantError } from '../../src/modules/finance/domain/finance.repository';
import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import type { CurrentUser } from '../../src/common/types/current-user';
import { PAYMENT_DIRECTION, PAYMENT_PURPOSE } from '../../src/modules/finance/domain/payment-types';
import {
  TRANSACTION_STATUS,
  EXPENSE_STATUS,
} from '../../src/modules/finance/domain/payment-status';
import { Prisma } from '@prisma/client';
import {
  FinanceRecordNotFoundError,
  InvalidExpenseDetailsError,
  InvalidPaymentCommandError,
  ManualPaymentIdempotencyConflictError,
} from '../../src/modules/finance/application/finance.errors';

describe('FinanceService Unit Tests', () => {
  let service: FinanceService;
  let repo: jest.Mocked<FinanceRepository>;
  let audit: jest.Mocked<AuditPort>;

  let createPaymentMock: jest.MockedFunction<FinanceRepository['createPayment']>;
  let claimPaymentIdempotencyMock: jest.MockedFunction<
    FinanceRepository['claimPaymentIdempotency']
  >;
  let voidPaymentMock: jest.MockedFunction<FinanceRepository['voidPayment']>;
  let createExpenseMock: jest.MockedFunction<FinanceRepository['createExpense']>;
  let claimExpenseMock: jest.MockedFunction<FinanceRepository['claimExpenseIdempotency']>;
  let releaseExpenseMock: jest.MockedFunction<FinanceRepository['releaseExpenseIdempotency']>;
  let voidExpenseMock: jest.MockedFunction<FinanceRepository['voidExpense']>;
  let auditLogMock: jest.MockedFunction<AuditPort['log']>;

  const currentUser: CurrentUser = {
    userId: 'user-1',
    memberId: 'member-1',
    shopId: 'shop-1',
    email: 'user@example.com',
    fullName: 'Test Accountant',
    permissions: ['finance.manage'],
  };

  const samplePayment = {
    id: 'pay-1',
    shopId: 'shop-1',
    orderId: 'order-1',
    customerId: 'cust-1',
    transactionNumber: 'PAY-20261001-001',
    direction: PAYMENT_DIRECTION.IN,
    purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
    paymentMethod: 'CASH',
    amount: new Prisma.Decimal(100000),
    currency: 'VND',
    status: TRANSACTION_STATUS.COMPLETED,
    paidAt: new Date('2026-10-01T12:00:00.000Z'),
    voidedAt: null,
    voidedBy: null,
    externalReference: null,
    paymentProofUrl: null,
    note: null,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedAt: new Date('2026-10-01T12:00:00.000Z'),
  };

  const sampleExpense: ExpenseRecord = {
    id: 'exp-1',
    shopId: 'shop-1',
    expenseNumber: 'EXP-20261001-001',
    categoryId: 'cat-1',
    orderId: null,
    inventoryItemId: null,
    description: 'Dry cleaning',
    amount: new Prisma.Decimal(50000),
    currency: 'VND',
    vendorName: null,
    receiptUrl: null,
    createdBy: 'member-1',
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedAt: new Date('2026-10-01T12:00:00.000Z'),
    expenseDate: new Date('2026-10-01'),
    paymentMethod: 'CASH',
    paidAt: new Date('2026-10-01T12:00:00.000Z'),
    status: EXPENSE_STATUS.PAID,
    voidedAt: null,
  };

  beforeEach(() => {
    createPaymentMock = jest.fn().mockResolvedValue(samplePayment);
    claimPaymentIdempotencyMock = jest
      .fn()
      .mockResolvedValue({ state: 'CLAIMED', claimId: 'claim-1' });
    voidPaymentMock = jest.fn().mockResolvedValue(samplePayment);
    createExpenseMock = jest.fn().mockResolvedValue(sampleExpense);
    claimExpenseMock = jest.fn().mockResolvedValue({ state: 'CLAIMED', claimId: 'expense-claim' });
    releaseExpenseMock = jest.fn().mockResolvedValue(undefined);
    voidExpenseMock = jest.fn().mockResolvedValue(sampleExpense);
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    repo = {
      createPayment: createPaymentMock,
      claimPaymentIdempotency: claimPaymentIdempotencyMock,
      releasePaymentIdempotency: jest.fn().mockResolvedValue(undefined),
      voidPayment: voidPaymentMock,
      listPayments: jest.fn(),
      listExpenseCategories: jest.fn(),
      createExpense: createExpenseMock,
      claimExpenseIdempotency: claimExpenseMock,
      releaseExpenseIdempotency: releaseExpenseMock,
      voidExpense: voidExpenseMock,
      listExpenses: jest.fn(),
    };

    audit = {
      log: auditLogMock,
    };

    service = new FinanceService(repo, audit, { now: () => new Date('2026-10-01T12:00:00.000Z') });
  });

  describe('createPayment', () => {
    it('requires an opaque idempotency key before claiming or recording a receipt', async () => {
      await expect(
        service.createPayment(currentUser, 'order-1', {
          direction: PAYMENT_DIRECTION.IN,
          purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
          paymentMethod: 'CASH',
          amount: 100000,
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
      expect(claimPaymentIdempotencyMock).not.toHaveBeenCalled();
      expect(createPaymentMock).not.toHaveBeenCalled();
    });

    it('replays a completed receipt without recording a second payment or audit', async () => {
      const result = {
        id: 'pay-1',
        orderId: 'order-1',
        customerId: 'cust-1',
        transactionNumber: 'PAY-20261001-001',
        direction: 'IN',
        purpose: 'RENTAL_PAYMENT',
        paymentMethod: 'CASH',
        amount: '100000',
        status: 'COMPLETED',
        paidAt: '2026-10-01T12:00:00.000Z',
      };
      claimPaymentIdempotencyMock.mockResolvedValueOnce({
        state: 'COMPLETED',
        responseBody: { version: 1, kind: 'finance-manual-payment-create', result },
      });

      await expect(
        service.createPayment(
          currentUser,
          'order-1',
          {
            direction: PAYMENT_DIRECTION.IN,
            purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
            paymentMethod: 'CASH',
            amount: 100000,
          },
          'payment-replay',
        ),
      ).resolves.toEqual(result);
      expect(createPaymentMock).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it('uses a stable missing-paidAt marker and rejects a key reused for a different command', async () => {
      claimPaymentIdempotencyMock
        .mockResolvedValueOnce({ state: 'CLAIMED', claimId: 'claim-1' })
        .mockResolvedValueOnce({ state: 'HASH_MISMATCH' });
      const command = {
        direction: PAYMENT_DIRECTION.IN,
        purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
        paymentMethod: 'CASH' as const,
        amount: 100000,
      };
      await service.createPayment(currentUser, 'order-1', command, 'payment-stable');
      await expect(
        service.createPayment(currentUser, 'order-1', command, 'payment-stable'),
      ).rejects.toBeInstanceOf(ManualPaymentIdempotencyConflictError);
      expect(claimPaymentIdempotencyMock.mock.calls[0]?.[0]?.requestHash).toBe(
        claimPaymentIdempotencyMock.mock.calls[1]?.[0]?.requestHash,
      );
    });

    it('throws Error if refund purpose is used with IN direction', async () => {
      await expect(
        service.createPayment(currentUser, 'order-1', {
          direction: PAYMENT_DIRECTION.IN,
          purpose: PAYMENT_PURPOSE.DEPOSIT_REFUND,
          paymentMethod: 'CASH',
          amount: 50000,
        }),
      ).rejects.toThrow(
        new InvalidPaymentCommandError('Giao dịch hoàn tiền (DEPOSIT_REFUND) phải là khoản chi.'),
      );
    });

    it('throws Error if OUT direction is used with non-refund/non-other purpose', async () => {
      await expect(
        service.createPayment(currentUser, 'order-1', {
          direction: PAYMENT_DIRECTION.OUT,
          purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
          paymentMethod: 'CASH',
          amount: 50000,
        }),
      ).rejects.toThrow(
        new InvalidPaymentCommandError(
          'Giao dịch chi phải có mục đích hoàn tiền hoặc mục đích khác.',
        ),
      );
    });

    it('maps FinanceInvariantError to Error', async () => {
      repo.createPayment.mockRejectedValueOnce(
        new FinanceInvariantError('Tiền hoàn cọc không được vượt quá tiền cọc đang giữ.'),
      );

      await expect(
        service.createPayment(
          currentUser,
          'order-1',
          {
            direction: PAYMENT_DIRECTION.OUT,
            purpose: PAYMENT_PURPOSE.DEPOSIT_REFUND,
            paymentMethod: 'CASH',
            amount: 500000,
          },
          'payment-invariant',
        ),
      ).rejects.toThrow(
        new InvalidPaymentCommandError('Tiền hoàn cọc không được vượt quá tiền cọc đang giữ.'),
      );
    });

    it('throws Error if order does not exist or belongs to another shop', async () => {
      repo.createPayment.mockResolvedValueOnce(null);

      await expect(
        service.createPayment(
          currentUser,
          'non-existent',
          {
            direction: PAYMENT_DIRECTION.IN,
            purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
            paymentMethod: 'CASH',
            amount: 100000,
          },
          'payment-missing-order',
        ),
      ).rejects.toThrow(new FinanceRecordNotFoundError('Không tìm thấy đơn thuê.'));
    });

    it('creates payment successfully and logs audit event', async () => {
      const result = await service.createPayment(
        currentUser,
        'order-1',
        {
          direction: PAYMENT_DIRECTION.IN,
          purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
          paymentMethod: 'CASH',
          amount: 100000,
        },
        'payment-success',
      );

      expect(result).toBeDefined();
      expect(createPaymentMock).toHaveBeenCalledTimes(1);
      const createInput = createPaymentMock.mock.calls[0]?.[0];
      expect(createInput?.idempotency?.key).toBe('payment-success');
      expect(createInput?.audit).toEqual({
        actorUserId: currentUser.userId,
        actorMemberId: currentUser.memberId,
      });
      expect(auditLogMock).not.toHaveBeenCalled();
    });
  });

  describe('voidPayment', () => {
    it('throws Error if payment not found or belongs to another shop', async () => {
      voidPaymentMock.mockResolvedValueOnce(null);

      await expect(service.voidPayment(currentUser, 'non-existent')).rejects.toThrow(
        new FinanceRecordNotFoundError('Không tìm thấy giao dịch thanh toán.'),
      );
    });

    it('voids payment successfully and logs audit event', async () => {
      const result = await service.voidPayment(currentUser, 'pay-1');

      expect(result).toBeDefined();
      expect(voidPaymentMock).toHaveBeenCalledTimes(1);
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: currentUser.shopId,
          action: 'VOID',
          entityType: 'payment_transaction',
          entityId: 'pay-1',
        }),
      );
    });
  });

  describe('createExpense', () => {
    it('maps FinanceInvariantError to Error', async () => {
      createExpenseMock.mockRejectedValueOnce(
        new FinanceInvariantError('Expense category not active'),
      );

      await expect(
        service.createExpense(
          currentUser,
          {
            categoryId: 'cat-inactive',
            description: 'Dry cleaning',
            amount: 50000,
            expenseDate: '2026-10-01',
            paymentMethod: 'CASH',
          },
          'expense-inactive',
        ),
      ).rejects.toThrow(new InvalidExpenseDetailsError('Expense category not active'));
    });

    it('passes claim ownership and audit actor into the atomic expense write', async () => {
      const result = await service.createExpense(
        currentUser,
        {
          categoryId: 'cat-1',
          description: 'Dry cleaning',
          amount: 50000,
          expenseDate: '2026-10-01',
          paymentMethod: 'CASH',
        },
        'expense-create',
      );

      expect(result).toBeDefined();
      expect(createExpenseMock).toHaveBeenCalledTimes(1);
      expect(createExpenseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: currentUser.shopId,
          idempotency: {
            scope: 'finance.expense.create.v1:member-1',
            key: 'expense-create',
            claimId: 'expense-claim',
          },
          audit: { actorUserId: currentUser.userId, actorMemberId: currentUser.memberId },
        }),
      );
      expect(auditLogMock).not.toHaveBeenCalled();
      expect(releaseExpenseMock).not.toHaveBeenCalled();
    });

    const expenseInput = {
      categoryId: 'cat-1',
      description: 'Dry cleaning',
      amount: 50000,
      expenseDate: '2026-10-01',
    };

    it.each([undefined, '', 'with spaces', ['one', 'two'], 'a'.repeat(256)])(
      'rejects an invalid key %j before any claim or expense write',
      async (key) => {
        await expect(service.createExpense(currentUser, expenseInput, key)).rejects.toBeInstanceOf(
          InvalidExpenseDetailsError,
        );
        expect(claimExpenseMock).not.toHaveBeenCalled();
        expect(createExpenseMock).not.toHaveBeenCalled();
      },
    );

    it('replays the stored creation result without new persistence or post-commit audit', async () => {
      const stored = toStoredExpenseCreateResult(sampleExpense);
      claimExpenseMock.mockResolvedValueOnce({ state: 'COMPLETED', responseBody: stored });
      await expect(service.createExpense(currentUser, expenseInput, 'replay')).resolves.toEqual(
        stored.result,
      );
      expect(createExpenseMock).not.toHaveBeenCalled();
      expect(auditLogMock).not.toHaveBeenCalled();
    });

    it.each(['IN_PROGRESS', 'HASH_MISMATCH'] as const)(
      'does not execute a %s claim',
      async (state) => {
        claimExpenseMock.mockResolvedValueOnce({ state });
        await expect(
          service.createExpense(currentUser, expenseInput, 'conflict'),
        ).rejects.toMatchObject({ kind: 'CONFLICT' });
        expect(createExpenseMock).not.toHaveBeenCalled();
        expect(releaseExpenseMock).not.toHaveBeenCalled();
      },
    );

    it('does not repeat a write when the retained replay result is malformed', async () => {
      claimExpenseMock.mockResolvedValueOnce({
        state: 'COMPLETED',
        responseBody: { version: 1, result: {} },
      });
      await expect(
        service.createExpense(currentUser, expenseInput, 'malformed'),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_REPLAY_INVALID' });
      expect(createExpenseMock).not.toHaveBeenCalled();
    });

    it('keeps the original failure when best-effort claim cleanup also fails', async () => {
      const original = new Error('transaction rolled back');
      createExpenseMock.mockRejectedValueOnce(original);
      releaseExpenseMock.mockRejectedValueOnce(new Error('cleanup unavailable'));
      await expect(service.createExpense(currentUser, expenseInput, 'cleanup')).rejects.toBe(
        original,
      );
      expect(releaseExpenseMock).toHaveBeenCalledWith(
        currentUser.shopId,
        'finance.expense.create.v1:member-1',
        'cleanup',
        'expense-claim',
      );
    });
  });

  describe('voidExpense', () => {
    it('throws Error if expense not found or belongs to another shop', async () => {
      voidExpenseMock.mockResolvedValueOnce(null);

      await expect(service.voidExpense(currentUser, 'non-existent')).rejects.toThrow(
        new FinanceRecordNotFoundError('Không tìm thấy khoản chi.'),
      );
    });

    it('voids expense successfully and logs audit event', async () => {
      const result = await service.voidExpense(currentUser, 'exp-1');

      expect(result).toBeDefined();
      expect(voidExpenseMock).toHaveBeenCalledTimes(1);
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: currentUser.shopId,
          action: 'VOID',
          entityType: 'expense',
          entityId: 'exp-1',
        }),
      );
    });
  });
});
