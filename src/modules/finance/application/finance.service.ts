import { generateDatedReference } from '@common/utils/reference-number';
import { CLOCK, type Clock } from '@common/clock/clock';
import type { JsonValue } from '@common/types/json';
import { PAYMENT_PURPOSE, PAYMENT_DIRECTION } from '@modules/finance/domain/payment-types';
import {
  APPLICATION_LOGGER,
  silentApplicationLog,
  type ApplicationLog,
  type ApplicationLoggerFactory,
} from '@common/logging/application-logger.port';

import type { CurrentUser } from '@common/types/current-user';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  FINANCE_REPOSITORY,
  FinanceInvariantError,
  type FinanceRepository,
} from '../domain/finance.repository';
import {
  FINANCE_MANUAL_PAYMENT_IDEMPOTENCY_SCOPE,
  FINANCE_MANUAL_PAYMENT_REPLAY_RETENTION_MS,
  FinancePaymentClaimLostError,
  isStoredManualPaymentCreateResult,
  toManualPaymentCreateResult,
  type ManualPaymentCreateResult,
} from '../domain/manual-payment-idempotency';
import type {
  CreateExpenseInput,
  CreatePaymentInput,
  ExpenseListQuery,
  PaymentListQuery,
} from './finance.contracts';
import {
  FinanceRecordNotFoundError,
  InvalidExpenseDetailsError,
  InvalidPaymentCommandError,
  ManualPaymentIdempotencyConflictError,
  ManualPaymentReplayUnavailableError,
} from './finance.errors';

const PAYMENT_PURPOSES: ReadonlySet<string> = new Set(Object.values(PAYMENT_PURPOSE));

@Injectable()
export class FinanceService {
  private readonly logger: ApplicationLog;

  constructor(
    @Inject(FINANCE_REPOSITORY) private readonly repository: FinanceRepository,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional() @Inject(APPLICATION_LOGGER) loggerFactory?: ApplicationLoggerFactory,
  ) {
    this.logger = loggerFactory?.create(FinanceService.name) ?? silentApplicationLog;
  }

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

  async createPayment(
    user: CurrentUser,
    orderId: string,
    input: CreatePaymentInput,
    rawIdempotencyKey?: string | string[],
  ): Promise<ManualPaymentCreateResult> {
    if (!PAYMENT_PURPOSES.has(input.purpose)) {
      throw new InvalidPaymentCommandError('Mục đích thanh toán không hợp lệ.');
    }
    const refundPurpose =
      input.purpose === PAYMENT_PURPOSE.DEPOSIT_REFUND ||
      input.purpose === PAYMENT_PURPOSE.ORDER_REFUND;
    if (refundPurpose && input.direction !== PAYMENT_DIRECTION.OUT) {
      throw new InvalidPaymentCommandError(
        `Giao dịch hoàn tiền (${input.purpose}) phải là khoản chi.`,
      );
    }
    if (
      !refundPurpose &&
      input.direction === PAYMENT_DIRECTION.OUT &&
      input.purpose !== PAYMENT_PURPOSE.OTHER
    ) {
      throw new InvalidPaymentCommandError(
        'Giao dịch chi phải có mục đích hoàn tiền hoặc mục đích khác.',
      );
    }
    const key = requireIdempotencyKey(rawIdempotencyKey);
    const paidAt = input.paidAt ? parsePaidAt(input.paidAt) : undefined;
    const scope = `${FINANCE_MANUAL_PAYMENT_IDEMPOTENCY_SCOPE}:${user.memberId}`;
    const claim = await this.repository.claimPaymentIdempotency({
      shopId: user.shopId,
      scope,
      key,
      requestHash: hashManualPaymentCommand(orderId, input, paidAt),
      expiresAt: new Date(this.clock.now().getTime() + FINANCE_MANUAL_PAYMENT_REPLAY_RETENTION_MS),
    });
    if (claim.state === 'HASH_MISMATCH') {
      throw new ManualPaymentIdempotencyConflictError(
        'IDEMPOTENCY_KEY_REUSED',
        'Mã chống trùng đã được dùng cho một yêu cầu ghi nhận tiền khác.',
      );
    }
    if (claim.state === 'IN_PROGRESS') {
      throw new ManualPaymentIdempotencyConflictError(
        'IDEMPOTENCY_IN_PROGRESS',
        'Yêu cầu ghi nhận tiền đang được xử lý. Vui lòng thử lại với cùng mã.',
      );
    }
    if (claim.state === 'COMPLETED') {
      if (!isStoredManualPaymentCreateResult(claim.responseBody)) {
        throw new ManualPaymentReplayUnavailableError();
      }
      return claim.responseBody.result;
    }
    let payment: Awaited<ReturnType<FinanceRepository['createPayment']>> | undefined;
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
        paidAt: paidAt ?? this.clock.now(),
        createdBy: user.memberId,
        idempotency: { scope, key, claimId: claim.claimId },
        audit: { actorUserId: user.userId, actorMemberId: user.memberId },
      });
    } catch (error) {
      if (error instanceof FinancePaymentClaimLostError) {
        throw new ManualPaymentIdempotencyConflictError(
          'IDEMPOTENCY_CLAIM_LOST',
          'Yêu cầu ghi nhận tiền đã được thay thế. Vui lòng thử lại với cùng mã.',
        );
      }
      if (error instanceof FinanceInvariantError)
        throw new InvalidPaymentCommandError(error.message);
      throw error;
    } finally {
      if (!payment) {
        try {
          await this.repository.releasePaymentIdempotency(user.shopId, scope, key, claim.claimId);
        } catch (releaseError) {
          this.logger.error({
            event: 'finance.manual-payment.idempotency.release.failed',
            shopId: user.shopId,
            error:
              releaseError instanceof Error
                ? releaseError
                : new Error('Lỗi không xác định khi giải phóng khóa idempotency.'),
          });
        }
      }
    }
    if (!payment) throw new FinanceRecordNotFoundError('Không tìm thấy đơn thuê.');
    return toManualPaymentCreateResult(payment);
  }

  async voidPayment(user: CurrentUser, id: string) {
    const payment = await this.repository.voidPayment({
      shopId: user.shopId,
      paymentId: id,
      voidedBy: user.memberId,
    });
    if (!payment) throw new FinanceRecordNotFoundError('Không tìm thấy giao dịch thanh toán.');
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
      throw new InvalidExpenseDetailsError('Nội dung khoản chi cần từ 3 đến 2.000 ký tự.');
    }
    if (
      !Number.isFinite(expenseDate.getTime()) ||
      expenseDate.toISOString().slice(0, 10) !== input.expenseDate
    ) {
      throw new InvalidExpenseDetailsError('Ngày chi không hợp lệ.');
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
      if (error instanceof FinanceInvariantError)
        throw new InvalidExpenseDetailsError(error.message);
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
    if (!expense) throw new FinanceRecordNotFoundError('Không tìm thấy khoản chi.');
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

function requireIdempotencyKey(value: string | string[] | undefined): string {
  if (value === undefined) {
    throw new InvalidPaymentCommandError(
      'Cần có Idempotency-Key để ghi nhận tiền.',
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  if (Array.isArray(value) || !/^[\x21-\x7e]{1,255}$/.test(value)) {
    throw new InvalidPaymentCommandError(
      'Idempotency-Key không hợp lệ.',
      'IDEMPOTENCY_KEY_INVALID',
    );
  }
  return value;
}

function parsePaidAt(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()))
    throw new InvalidPaymentCommandError('Thời gian thanh toán không hợp lệ.');
  return parsed;
}

function hashManualPaymentCommand(
  orderId: string,
  input: CreatePaymentInput,
  paidAt: Date | undefined,
): string {
  return createHash('sha256')
    .update(
      stableJson({
        version: 1,
        orderId,
        direction: input.direction,
        purpose: input.purpose,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        externalReference: input.externalReference ?? null,
        bankReference: input.bankReference ?? null,
        note: input.note ?? null,
        paidAt: paidAt?.toISOString() ?? null,
      }),
    )
    .digest('hex');
}

function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value)
    .filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`;
}
