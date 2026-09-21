import type { PaymentRecordedEvent } from '../domain/finance.events';
import { TRANSACTION_STATUS, EXPENSE_STATUS } from '../domain/payment-status';
import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { paginateMeta } from '@common/types/pagination';
import { recomputeOrderPaymentState } from '@database/prisma/order-payment-state';
import { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CLOCK, type Clock } from '@common/clock/clock';
import {
  assertPaymentCreationAllowed,
  assertPaymentVoidAllowed,
} from '@modules/rentals/domain/rental-monetary.policy';
import { lockRentalMonetaryOrder } from '@modules/rentals/infrastructure/rental-monetary-boundary';
import {
  claimIdempotency,
  lockRentalClaim,
  releaseIdempotency,
} from '@modules/rentals/infrastructure/rental-idempotency';
import { RentalClaimLostError } from '@modules/rentals/domain/rental-errors';
import { FinanceInvariantError, type FinanceRepository } from '../domain/finance.repository';
import {
  FinancePaymentClaimLostError,
  toStoredManualPaymentCreateResult,
} from '../domain/manual-payment-idempotency';

@Injectable()
export class PrismaFinanceRepository implements FinanceRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock = { now: () => new Date() },
  ) {}

  claimPaymentIdempotency(input: Parameters<FinanceRepository['claimPaymentIdempotency']>[0]) {
    return claimIdempotency(this.prisma, this.clock, input);
  }

  releasePaymentIdempotency(shopId: string, scope: string, key: string, claimId: string) {
    return releaseIdempotency(this.prisma, shopId, scope, key, claimId);
  }

  async createPayment(input: Parameters<FinanceRepository['createPayment']>[0]) {
    return serializableTransaction(this.prisma, async (tx) => {
      if (input.idempotency) {
        try {
          await lockRentalClaim(tx, input.shopId, input.idempotency);
        } catch (error) {
          if (error instanceof RentalClaimLostError) throw new FinancePaymentClaimLostError();
          throw error;
        }
      }
      if (!(await lockRentalMonetaryOrder(tx, input))) return null;
      const order = await tx.rentalOrder.findFirst({
        where: { id: input.orderId, shopId: input.shopId },
      });
      if (!order) return null;

      const settlement = await tx.rentalSettlement.findFirst({
        where: { shopId: input.shopId, orderId: order.id },
        select: { orderId: true },
      });
      assertPaymentCreationAllowed(
        { status: order.status, hasSettlement: Boolean(settlement) },
        input,
      );

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
              ? 'Tiền hoàn cọc không được vượt quá tiền cọc đang giữ.'
              : 'Tiền hoàn đơn không được vượt quá tiền thực nhận sau hoàn tiền, không bao gồm tiền cọc.',
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
      if (input.idempotency) {
        if (!input.audit)
          throw new FinanceInvariantError('Thiếu dữ liệu kiểm toán cho giao dịch thủ công.');
        await tx.auditLog.create({
          data: {
            shopId: input.shopId,
            actorUserId: input.audit.actorUserId,
            actorMemberId: input.audit.actorMemberId,
            action: 'CREATE',
            entityType: 'payment_transaction',
            entityId: payment.id,
            newValues: {
              orderId: payment.orderId,
              direction: payment.direction,
              purpose: payment.purpose,
              amount: payment.amount.toString(),
            },
          },
        });
        const completed = await tx.idempotencyRecord.updateMany({
          where: {
            id: input.idempotency.claimId,
            shopId: input.shopId,
            scope: input.idempotency.scope,
            key: input.idempotency.key,
            completedAt: null,
          },
          data: {
            responseCode: 201,
            responseBody: toStoredManualPaymentCreateResult(
              payment,
            ) as unknown as Prisma.InputJsonValue,
            completedAt: this.clock.now(),
          },
        });
        if (completed.count !== 1) throw new FinancePaymentClaimLostError();
      }
      return payment;
    });
  }

  async voidPayment(input: { shopId: string; paymentId: string; voidedBy: string }) {
    const route = await this.prisma.paymentTransaction.findFirst({
      where: { id: input.paymentId, shopId: input.shopId, voidedAt: null },
      select: { orderId: true },
    });
    if (!route) return null;

    return serializableTransaction(this.prisma, async (tx) => {
      if (!(await lockRentalMonetaryOrder(tx, { shopId: input.shopId, orderId: route.orderId }))) {
        return null;
      }
      const order = await tx.rentalOrder.findFirst({
        where: { id: route.orderId, shopId: input.shopId },
        include: { confirmation: { select: { orderId: true } } },
      });
      if (!order) return null;
      const payment = await tx.paymentTransaction.findFirst({
        where: {
          id: input.paymentId,
          shopId: input.shopId,
          orderId: order.id,
          voidedAt: null,
        },
      });
      if (!payment) return null;

      const settlement = await tx.rentalSettlement.findFirst({
        where: { shopId: input.shopId, orderId: order.id },
        select: { orderId: true },
      });
      assertPaymentVoidAllowed(
        {
          status: order.status,
          hasSettlement: Boolean(settlement),
          hasConfirmation: Boolean(order.confirmation),
        },
        order.id,
        payment,
      );
      await assertVoidKeepsRefundsCovered(tx, order.id, payment.id);

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
          'Danh mục chi phí không thuộc cửa hàng này hoặc đã ngừng hoạt động.',
        );

      if (input.orderId) {
        const orderExists = await tx.rentalOrder.count({
          where: { id: input.orderId, shopId: input.shopId },
        });
        if (!orderExists)
          throw new FinanceInvariantError('Đơn thuê của khoản chi không thuộc cửa hàng này.');
      }
      if (input.inventoryItemId) {
        const itemExists = await tx.inventoryItem.count({
          where: { id: input.inventoryItemId, shopId: input.shopId },
        });
        if (!itemExists)
          throw new FinanceInvariantError('Món đồ của khoản chi không thuộc cửa hàng này.');
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
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}

async function assertVoidKeepsRefundsCovered(
  tx: Prisma.TransactionClient,
  orderId: string,
  paymentId: string,
): Promise<void> {
  const payments = await tx.paymentTransaction.findMany({
    where: {
      orderId,
      id: { not: paymentId },
      status: TRANSACTION_STATUS.COMPLETED,
      voidedAt: null,
    },
    select: { amount: true, direction: true, purpose: true },
  });
  const net = payments.reduce(
    (total, payment) => {
      const amount = decimalToNumber(payment.amount);
      const isDeposit = payment.purpose === 'DEPOSIT' || payment.purpose === 'DEPOSIT_REFUND';
      const bucket = isDeposit ? 'deposit' : 'rental';
      total[bucket] += payment.direction === 'IN' ? amount : -amount;
      return total;
    },
    { deposit: 0, rental: 0 },
  );
  if (net.deposit < 0 || net.rental < 0) {
    throw new FinanceInvariantError(
      'Không thể hủy giao dịch vì sẽ làm tiền hoàn vượt quá số dư đã ghi nhận.',
    );
  }
}
