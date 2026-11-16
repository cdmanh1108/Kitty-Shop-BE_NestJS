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
import { AUDIT_PORT, type AuditPort } from '@modules/audit/public/audit-contracts';
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
import {
  FINANCE_EXPENSE_IDEMPOTENCY_SCOPE,
  FINANCE_EXPENSE_REPLAY_RETENTION_MS,
  FinanceExpenseClaimLostError,
  isStoredExpenseCreateResult,
  toExpenseCreateResult,
  type ExpenseCreateResult,
} from '../domain/expense-idempotency';
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
  ExpenseIdempotencyConflictError,
  ExpenseReplayUnavailableError,
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

  async createExpense(
    user: CurrentUser,
    input: CreateExpenseInput,
    rawIdempotencyKey?: string | string[],
  ): Promise<ExpenseCreateResult> {
    const key = requireExpenseIdempotencyKey(rawIdempotencyKey);
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
    if (!Number.isFinite(input.amount) || input.amount < 0.01) {
      throw new InvalidExpenseDetailsError('Số tiền phải lớn hơn 0.');
    }
    const paidAt = input.paidAt ? new Date(input.paidAt) : undefined;
    if (paidAt && !Number.isFinite(paidAt.getTime())) {
      throw new InvalidExpenseDetailsError('Thời gian thanh toán không hợp lệ.');
    }
    const scope = `${FINANCE_EXPENSE_IDEMPOTENCY_SCOPE}:${user.memberId}`;
    const requestHash = createHash('sha256')
      .update(
        stableJson({
          version: 1,
          categoryId: input.categoryId,
          description,
          amount: input.amount,
          expenseDate: input.expenseDate,
          orderId: input.orderId ?? null,
          inventoryItemId: input.inventoryItemId ?? null,
          paymentMethod: input.paymentMethod ?? null,
          vendorName: input.vendorName ?? null,
          paidAt: paidAt?.toISOString() ?? null,
          receiptUrl: input.receiptUrl ?? null,
        }),
      )
      .digest('hex');
    const claim = await this.repository.claimExpenseIdempotency({
      shopId: user.shopId,
      scope,
      key,
      requestHash,
      expiresAt: new Date(this.clock.now().getTime() + FINANCE_EXPENSE_REPLAY_RETENTION_MS),
    });
    if (claim.state === 'HASH_MISMATCH') {
      throw new ExpenseIdempotencyConflictError(
        'IDEMPOTENCY_KEY_REUSED',
        'Thông tin khoản chi khác với lần gửi trước. Vui lòng kiểm tra giao dịch đã lưu.',
      );
    }
    if (claim.state === 'IN_PROGRESS') {
      throw new ExpenseIdempotencyConflictError(
        'IDEMPOTENCY_IN_PROGRESS',
        'Khoản chi đang được lưu. Vui lòng đợi rồi thử lại.',
      );
    }
    if (claim.state === 'COMPLETED') {
      if (!isStoredExpenseCreateResult(claim.responseBody)) {
        throw new ExpenseReplayUnavailableError();
      }
      return claim.responseBody.result;
    }
    let expense: Awaited<ReturnType<FinanceRepository['createExpense']>> | undefined;
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
        paidAt,
        receiptUrl: input.receiptUrl,
        createdBy: user.memberId,
        idempotency: { scope, key, claimId: claim.claimId },
        audit: { actorUserId: user.userId, actorMemberId: user.memberId },
      });
    } catch (error) {
      if (error instanceof FinanceExpenseClaimLostError) {
        throw new ExpenseIdempotencyConflictError(
          'IDEMPOTENCY_CLAIM_LOST',
          'Yêu cầu lưu đang được xử lý lại. Vui lòng đợi rồi thử lại.',
        );
      }
      if (error instanceof FinanceInvariantError)
        throw new InvalidExpenseDetailsError(error.message);
      throw error;
    } finally {
      if (!expense) {
        try {
          await this.repository.releaseExpenseIdempotency(user.shopId, scope, key, claim.claimId);
        } catch (releaseError) {
          this.logger.error({
            event: 'finance.expense.idempotency.release.failed',
            shopId: user.shopId,
            error:
              releaseError instanceof Error
                ? releaseError
                : new Error('Không thể giải phóng yêu cầu lưu khoản chi.'),
          });
        }
      }
    }
    return toExpenseCreateResult(expense);
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

function requireExpenseIdempotencyKey(value: string | string[] | undefined): string {
  if (value === undefined) {
    throw new InvalidExpenseDetailsError(
      'Thiếu thông tin xác nhận lần lưu khoản chi. Vui lòng tải lại trang và thử lại.',
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  if (Array.isArray(value) || !/^[\x21-\x7e]{1,255}$/.test(value)) {
    throw new InvalidExpenseDetailsError(
      'Thông tin xác nhận lần lưu khoản chi không hợp lệ.',
      'IDEMPOTENCY_KEY_INVALID',
    );
  }
  return value;
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
