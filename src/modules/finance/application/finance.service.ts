import type { CurrentUser } from '@common/types/current-user';
import { AuditService } from '@modules/audit/application/audit.service';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  FINANCE_REPOSITORY,
  FinanceInvariantError,
  type FinanceRepository,
} from '../domain/finance.repository';
import type {
  CreateExpenseInput,
  CreatePaymentInput,
  ExpenseListQuery,
  PaymentListQuery,
} from './finance.contracts';

const PAYMENT_PURPOSES = new Set([
  'RENTAL_PAYMENT',
  'DEPOSIT',
  'LATE_FEE',
  'DAMAGE_FEE',
  'SHIPPING',
  'DEPOSIT_REFUND',
  'ORDER_REFUND',
  'OTHER',
]);

@Injectable()
export class FinanceService {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repository: FinanceRepository,
    private readonly audit: AuditService,
  ) {}

  listPayments(user: CurrentUser, query: PaymentListQuery) {
    return this.repository.listPayments({
      shopId: user.shopId,
      page: query.page,
      limit: query.limit,
      orderId: query.orderId,
      purpose: query.purpose,
      from: query.from ? new Date(query.from) : undefined,
      until: query.until ? new Date(query.until) : undefined,
    });
  }

  async createPayment(user: CurrentUser, orderId: string, input: CreatePaymentInput) {
    if (!PAYMENT_PURPOSES.has(input.purpose)) {
      throw new BadRequestException('Unsupported payment purpose');
    }
    const refundPurpose = ['DEPOSIT_REFUND', 'ORDER_REFUND'].includes(input.purpose);
    if (refundPurpose && input.direction !== 'OUT') {
      throw new BadRequestException(`${input.purpose} must use direction OUT`);
    }
    if (!refundPurpose && input.direction === 'OUT' && input.purpose !== 'OTHER') {
      throw new BadRequestException('OUT transactions must use a refund purpose or OTHER');
    }
    let payment: Awaited<ReturnType<FinanceRepository['createPayment']>>;
    try {
      payment = await this.repository.createPayment({
        shopId: user.shopId,
        orderId,
        transactionNumber: this.number('PAY'),
        direction: input.direction,
        purpose: input.purpose,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        externalReference: input.externalReference,
        bankReference: input.bankReference,
        note: input.note,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        createdBy: user.memberId,
      });
    } catch (error) {
      if (error instanceof FinanceInvariantError) throw new BadRequestException(error.message);
      throw error;
    }
    if (!payment) throw new NotFoundException('Rental order not found');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'payment_transaction',
      newValues: {
        orderId,
        direction: input.direction,
        purpose: input.purpose,
        amount: input.amount,
      },
    });
    return payment;
  }

  async voidPayment(user: CurrentUser, id: string) {
    const payment = await this.repository.voidPayment({
      shopId: user.shopId,
      paymentId: id,
      voidedBy: user.memberId,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'VOID',
      entityType: 'payment_transaction',
      entityId: id,
    });
    return payment;
  }

  listExpenseCategories(user: CurrentUser) {
    return this.repository.listExpenseCategories(user.shopId);
  }

  listExpenses(user: CurrentUser, query: ExpenseListQuery) {
    return this.repository.listExpenses({
      shopId: user.shopId,
      page: query.page,
      limit: query.limit,
      categoryId: query.categoryId,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      until: query.until ? new Date(query.until) : undefined,
    });
  }

  async createExpense(user: CurrentUser, input: CreateExpenseInput) {
    let expense: Awaited<ReturnType<FinanceRepository['createExpense']>>;
    try {
      expense = await this.repository.createExpense({
        shopId: user.shopId,
        expenseNumber: this.number('EXP'),
        categoryId: input.categoryId,
        orderId: input.orderId,
        inventoryItemId: input.inventoryItemId,
        description: input.description,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        vendorName: input.vendorName,
        expenseDate: new Date(input.expenseDate),
        paidAt: input.paidAt ? new Date(input.paidAt) : undefined,
        receiptUrl: input.receiptUrl,
        createdBy: user.memberId,
      });
    } catch (error) {
      if (error instanceof FinanceInvariantError) throw new BadRequestException(error.message);
      throw error;
    }
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'expense',
      newValues: { amount: input.amount, description: input.description },
    });
    return expense;
  }

  async voidExpense(user: CurrentUser, id: string) {
    const expense = await this.repository.voidExpense({ shopId: user.shopId, expenseId: id });
    if (!expense) throw new NotFoundException('Expense not found');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'VOID',
      entityType: 'expense',
      entityId: id,
    });
    return expense;
  }

  private number(prefix: string): string {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `${prefix}-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }
}
