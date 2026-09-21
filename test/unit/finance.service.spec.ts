import { FinanceService } from '../../src/modules/finance/application/finance.service';
import type { FinanceRepository } from '../../src/modules/finance/domain/finance.repository';
import { FinanceInvariantError } from '../../src/modules/finance/domain/finance.repository';
import type { AuditPort } from '../../src/modules/audit/domain/audit.port';
import type { CurrentUser } from '../../src/common/types/current-user';
import { PAYMENT_DIRECTION, PAYMENT_PURPOSE } from '../../src/modules/finance/domain/payment-types';
import {
  TRANSACTION_STATUS,
  EXPENSE_STATUS,
} from '../../src/modules/finance/domain/payment-status';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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

  const sampleExpense = {
    id: 'exp-1',
    shopId: 'shop-1',
    expenseNumber: 'EXP-20261001-001',
    description: 'Dry cleaning',
    amount: new Prisma.Decimal(50000),
    expenseDate: new Date('2026-10-01'),
    paymentMethod: 'CASH',
    paidAt: new Date('2026-10-01T12:00:00.000Z'),
    status: EXPENSE_STATUS.PAID,
    voidedAt: null,
    voidedBy: null,
    category: {
      id: 'cat-1',
      shopId: 'shop-1',
      code: 'CLEANING',
      name: 'Cleaning',
      createdAt: new Date('2026-10-01T12:00:00.000Z'),
      updatedAt: new Date('2026-10-01T12:00:00.000Z'),
    },
  };

  beforeEach(() => {
    createPaymentMock = jest.fn().mockResolvedValue(samplePayment);
    claimPaymentIdempotencyMock = jest
      .fn()
      .mockResolvedValue({ state: 'CLAIMED', claimId: 'claim-1' });
    voidPaymentMock = jest.fn().mockResolvedValue(samplePayment);
    createExpenseMock = jest.fn().mockResolvedValue(sampleExpense);
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
      ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
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
      ).rejects.toBeInstanceOf(ConflictException);
      expect(claimPaymentIdempotencyMock.mock.calls[0]?.[0]?.requestHash).toBe(
        claimPaymentIdempotencyMock.mock.calls[1]?.[0]?.requestHash,
      );
    });

    it('throws BadRequestException if refund purpose is used with IN direction', async () => {
      await expect(
        service.createPayment(currentUser, 'order-1', {
          direction: PAYMENT_DIRECTION.IN,
          purpose: PAYMENT_PURPOSE.DEPOSIT_REFUND,
          paymentMethod: 'CASH',
          amount: 50000,
        }),
      ).rejects.toThrow(
        new BadRequestException('Giao dịch hoàn tiền (DEPOSIT_REFUND) phải là khoản chi.'),
      );
    });

    it('throws BadRequestException if OUT direction is used with non-refund/non-other purpose', async () => {
      await expect(
        service.createPayment(currentUser, 'order-1', {
          direction: PAYMENT_DIRECTION.OUT,
          purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
          paymentMethod: 'CASH',
          amount: 50000,
        }),
      ).rejects.toThrow(
        new BadRequestException('Giao dịch chi phải có mục đích hoàn tiền hoặc mục đích khác.'),
      );
    });

    it('maps FinanceInvariantError to BadRequestException', async () => {
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
        new BadRequestException('Tiền hoàn cọc không được vượt quá tiền cọc đang giữ.'),
      );
    });

    it('throws NotFoundException if order does not exist or belongs to another tenant', async () => {
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
      ).rejects.toThrow(new NotFoundException('Không tìm thấy đơn thuê.'));
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
    it('throws NotFoundException if payment not found or belongs to another tenant', async () => {
      voidPaymentMock.mockResolvedValueOnce(null);

      await expect(service.voidPayment(currentUser, 'non-existent')).rejects.toThrow(
        new NotFoundException('Không tìm thấy giao dịch thanh toán.'),
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
    it('maps FinanceInvariantError to BadRequestException', async () => {
      createExpenseMock.mockRejectedValueOnce(
        new FinanceInvariantError('Expense category not active'),
      );

      await expect(
        service.createExpense(currentUser, {
          categoryId: 'cat-inactive',
          description: 'Dry cleaning',
          amount: 50000,
          expenseDate: '2026-10-01',
          paymentMethod: 'CASH',
        }),
      ).rejects.toThrow(new BadRequestException('Expense category not active'));
    });

    it('creates expense successfully and logs audit event', async () => {
      const result = await service.createExpense(currentUser, {
        categoryId: 'cat-1',
        description: 'Dry cleaning',
        amount: 50000,
        expenseDate: '2026-10-01',
        paymentMethod: 'CASH',
      });

      expect(result).toBeDefined();
      expect(createExpenseMock).toHaveBeenCalledTimes(1);
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: currentUser.shopId,
          action: 'CREATE',
          entityType: 'expense',
          entityId: sampleExpense.id,
        }),
      );
    });
  });

  describe('voidExpense', () => {
    it('throws NotFoundException if expense not found or belongs to another tenant', async () => {
      voidExpenseMock.mockResolvedValueOnce(null);

      await expect(service.voidExpense(currentUser, 'non-existent')).rejects.toThrow(
        new NotFoundException('Không tìm thấy khoản chi.'),
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
