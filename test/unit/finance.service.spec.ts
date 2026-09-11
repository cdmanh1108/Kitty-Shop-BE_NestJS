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
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('FinanceService Unit Tests', () => {
  let service: FinanceService;
  let repo: jest.Mocked<FinanceRepository>;
  let audit: jest.Mocked<AuditPort>;

  let createPaymentMock: jest.MockedFunction<FinanceRepository['createPayment']>;
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
    voidPaymentMock = jest.fn().mockResolvedValue(samplePayment);
    createExpenseMock = jest.fn().mockResolvedValue(sampleExpense);
    voidExpenseMock = jest.fn().mockResolvedValue(sampleExpense);
    auditLogMock = jest.fn().mockResolvedValue(undefined);

    repo = {
      createPayment: createPaymentMock,
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

    service = new FinanceService(repo, audit);
  });

  describe('createPayment', () => {
    it('throws BadRequestException if refund purpose is used with IN direction', async () => {
      await expect(
        service.createPayment(currentUser, 'order-1', {
          direction: PAYMENT_DIRECTION.IN,
          purpose: PAYMENT_PURPOSE.DEPOSIT_REFUND,
          paymentMethod: 'CASH',
          amount: 50000,
        }),
      ).rejects.toThrow(new BadRequestException('DEPOSIT_REFUND must use direction OUT'));
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
        new BadRequestException('OUT transactions must use a refund purpose or OTHER'),
      );
    });

    it('maps FinanceInvariantError to BadRequestException', async () => {
      repo.createPayment.mockRejectedValueOnce(
        new FinanceInvariantError('Deposit refund cannot exceed the currently held deposit'),
      );

      await expect(
        service.createPayment(currentUser, 'order-1', {
          direction: PAYMENT_DIRECTION.OUT,
          purpose: PAYMENT_PURPOSE.DEPOSIT_REFUND,
          paymentMethod: 'CASH',
          amount: 500000,
        }),
      ).rejects.toThrow(
        new BadRequestException('Deposit refund cannot exceed the currently held deposit'),
      );
    });

    it('throws NotFoundException if order does not exist or belongs to another tenant', async () => {
      repo.createPayment.mockResolvedValueOnce(null);

      await expect(
        service.createPayment(currentUser, 'non-existent', {
          direction: PAYMENT_DIRECTION.IN,
          purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
          paymentMethod: 'CASH',
          amount: 100000,
        }),
      ).rejects.toThrow(new NotFoundException('Rental order not found'));
    });

    it('creates payment successfully and logs audit event', async () => {
      const result = await service.createPayment(currentUser, 'order-1', {
        direction: PAYMENT_DIRECTION.IN,
        purpose: PAYMENT_PURPOSE.RENTAL_PAYMENT,
        paymentMethod: 'CASH',
        amount: 100000,
      });

      expect(result).toBeDefined();
      expect(createPaymentMock).toHaveBeenCalledTimes(1);
      expect(auditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: currentUser.shopId,
          action: 'CREATE',
          entityType: 'payment_transaction',
          entityId: samplePayment.id,
        }),
      );
    });
  });

  describe('voidPayment', () => {
    it('throws NotFoundException if payment not found or belongs to another tenant', async () => {
      voidPaymentMock.mockResolvedValueOnce(null);

      await expect(service.voidPayment(currentUser, 'non-existent')).rejects.toThrow(
        new NotFoundException('Payment not found'),
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
        new NotFoundException('Expense not found'),
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
