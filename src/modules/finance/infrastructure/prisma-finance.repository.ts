import type { PaymentRecordedEvent } from '../domain/finance.events';
import { TRANSACTION_STATUS, EXPENSE_STATUS } from '../domain/payment-status';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { paginateMeta } from '@common/types/pagination';
import { recomputeOrderPaymentState } from '@database/prisma/order-payment-state';
import { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { Injectable } from '@nestjs/common';
import { FinanceInvariantError, type FinanceRepository } from '../domain/finance.repository';

@Injectable()
export class PrismaFinanceRepository implements FinanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPayment(input: Parameters<FinanceRepository['createPayment']>[0]) {
    return serializableTransaction(this.prisma, async (tx) => {
      const order = await tx.rentalOrder.findFirst({
        where: { id: input.orderId, shopId: input.shopId },
      });
      if (!order) return null;

      if (input.direction === 'OUT' && ['DEPOSIT_REFUND', 'ORDER_REFUND'].includes(input.purpose)) {
        const existing = await tx.paymentTransaction.findMany({
          where: { orderId: order.id, status: TRANSACTION_STATUS.COMPLETED, voidedAt: null },
          select: { amount: true, direction: true, purpose: true },
        });
        const net = existing.reduce((sum, transaction) => {
          const isDeposit =
            transaction.purpose === 'DEPOSIT' || transaction.purpose === 'DEPOSIT_REFUND';
          const applies = input.purpose === 'DEPOSIT_REFUND' ? isDeposit : !isDeposit;
          if (!applies) return sum;
          const amount = decimalToNumber(transaction.amount);
          return sum + (transaction.direction === 'IN' ? amount : -amount);
        }, 0);
        if (input.amount > net) {
          throw new FinanceInvariantError(
            input.purpose === 'DEPOSIT_REFUND'
              ? 'Deposit refund cannot exceed the currently held deposit'
              : 'Order refund cannot exceed the net non-deposit amount received',
          );
        }
      }

      const payment = await tx.paymentTransaction.create({
        data: {
          shopId: input.shopId,
          orderId: order.id,
          customerId: order.customerId,
          transactionNumber: input.transactionNumber,
          direction: input.direction,
          purpose: input.purpose,
          paymentMethod: input.paymentMethod,
          amount: input.amount,
          externalReference: input.externalReference,
          bankReference: input.bankReference,
          note: input.note,
          paidAt: input.paidAt,
          createdBy: input.createdBy,
        },
      });
      await recomputeOrderPaymentState(tx, order.id);
      await tx.outboxEvent.create({
        data: {
          shopId: input.shopId,
          eventType: 'PAYMENT_RECORDED',
          aggregateType: 'payment_transaction',
          aggregateId: payment.id,
          payload: { paymentId: payment.id, orderId: order.id },
        } satisfies PaymentRecordedEvent,
      });
      return payment;
    });
  }

  async voidPayment(input: { shopId: string; paymentId: string; voidedBy: string }) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.findFirst({
        where: { id: input.paymentId, shopId: input.shopId, voidedAt: null },
      });
      if (!payment) return null;
      const updated = await tx.paymentTransaction.update({
        where: { id: payment.id },
        data: { status: TRANSACTION_STATUS.VOIDED, voidedAt: new Date(), voidedBy: input.voidedBy },
      });
      await recomputeOrderPaymentState(tx, payment.orderId);
      return updated;
    });
  }

  async listPayments(input: Parameters<FinanceRepository['listPayments']>[0]) {
    const where = {
      shopId: input.shopId,
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.purpose ? { purpose: input.purpose } : {}),
      ...(input.from || input.until
        ? {
            paidAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.until ? { lt: input.until } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.findMany({
        where,
        include: {
          order: { select: { orderNumber: true } },
          customer: { select: { fullName: true, phone: true } },
        },
        orderBy: { paidAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);
    return { items, meta: paginateMeta(input.page, input.limit, total) };
  }

  async createExpense(input: Parameters<FinanceRepository['createExpense']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.findFirst({
        where: { id: input.categoryId, shopId: input.shopId, isActive: true },
        select: { id: true },
      });
      if (!category)
        throw new FinanceInvariantError(
          'Expense category does not belong to this shop or is inactive',
        );

      if (input.orderId) {
        const orderExists = await tx.rentalOrder.count({
          where: { id: input.orderId, shopId: input.shopId },
        });
        if (!orderExists)
          throw new FinanceInvariantError('Expense order does not belong to this shop');
      }
      if (input.inventoryItemId) {
        const itemExists = await tx.inventoryItem.count({
          where: { id: input.inventoryItemId, shopId: input.shopId },
        });
        if (!itemExists)
          throw new FinanceInvariantError('Expense inventory item does not belong to this shop');
      }

      return tx.expense.create({ data: input });
    });
  }

  async listExpenses(input: Parameters<FinanceRepository['listExpenses']>[0]) {
    const where = {
      shopId: input.shopId,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.from || input.until
        ? {
            expenseDate: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.until ? { lt: input.until } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: { category: true },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { items, meta: paginateMeta(input.page, input.limit, total) };
  }

  async voidExpense(input: { shopId: string; expenseId: string }) {
    const existing = await this.prisma.expense.findFirst({
      where: { id: input.expenseId, shopId: input.shopId, voidedAt: null },
    });
    if (!existing) return null;
    return this.prisma.expense.update({
      where: { id: existing.id },
      data: { status: EXPENSE_STATUS.VOIDED, voidedAt: new Date() },
    });
  }

  listExpenseCategories(shopId: string) {
    return this.prisma.expenseCategory.findMany({
      where: { shopId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
