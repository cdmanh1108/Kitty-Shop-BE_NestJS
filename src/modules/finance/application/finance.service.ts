import { generateDatedReference } from '@common/utils/reference-number';
import { PAYMENT_PURPOSE, PAYMENT_DIRECTION } from '@modules/finance/domain/payment-types';

import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

const PAYMENT_PURPOSES: ReadonlySet<string> = new Set(Object.values(PAYMENT_PURPOSE));

@Injectable()
export class FinanceService {
  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repository: FinanceRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
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
      throw new BadRequestException('Mục đích thanh toán không hợp lệ.');
    }
    const refundPurpose =
      input.purpose === PAYMENT_PURPOSE.DEPOSIT_REFUND ||
      input.purpose === PAYMENT_PURPOSE.ORDER_REFUND;
    if (refundPurpose && input.direction !== PAYMENT_DIRECTION.OUT) {
      throw new BadRequestException(`Giao dịch hoàn tiền (${input.purpose}) phải là khoản chi.`);
    }
    if (
      !refundPurpose &&
      input.direction === PAYMENT_DIRECTION.OUT &&
      input.purpose !== PAYMENT_PURPOSE.OTHER
    ) {
      throw new BadRequestException('Giao dịch chi phải có mục đích hoàn tiền hoặc mục đích khác.');
    }
    let payment: Awaited<ReturnType<FinanceRepository['createPayment']>>;
    try {
      payment = await this.repository.createPayment({
        shopId: user.shopId,
        orderId,
        transactionNumber: generateDatedReference('PAY'),
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
    if (!payment) throw new NotFoundException('Không tìm thấy đơn thuê.');
    await this.audit.log({
      shopId: user.shopId,
      actorUserId: user.userId,
      actorMemberId: user.memberId,
      action: 'CREATE',
      entityType: 'payment_transaction',
      entityId: payment?.id,
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
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch thanh toán.');
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
    const description = input.description.trim();
    const expenseDate = new Date(input.expenseDate + 'T00:00:00Z');
    if (description.length < 3 || description.length > 2000) {
      throw new BadRequestException('Nội dung khoản chi cần từ 3 đến 2.000 ký tự.');
    }
    if (
      !Number.isFinite(expenseDate.getTime()) ||
      expenseDate.toISOString().slice(0, 10) !== input.expenseDate
    ) {
      throw new BadRequestException('Ngày chi không hợp lệ.');
    }
    let expense: Awaited<ReturnType<FinanceRepository['createExpense']>>;
    try {
      expense = await this.repository.createExpense({
        shopId: user.shopId,
        expenseNumber: generateDatedReference('EXP'),
        categoryId: input.categoryId,
        orderId: input.orderId,
        inventoryItemId: input.inventoryItemId,
        description,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        vendorName: input.vendorName,
        expenseDate,
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
      entityId: expense?.id,
      newValues: { amount: input.amount, description: input.description },
    });
    return expense;
  }

  async voidExpense(user: CurrentUser, id: string) {
    const expense = await this.repository.voidExpense({ shopId: user.shopId, expenseId: id });
    if (!expense) throw new NotFoundException('Không tìm thấy khoản chi.');
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
}
