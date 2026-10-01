import { ApplicationError } from '@common/errors/application-error';

export class InvalidPaymentCommandError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}

export class InvalidExpenseDetailsError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}

export class InvalidFinancePeriodError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}

export class FinanceRecordNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;
}

export class ManualPaymentIdempotencyConflictError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor(code: string, message: string) {
    super(message, code);
  }
}

export class ManualPaymentReplayUnavailableError extends ApplicationError {
  readonly kind = 'INTERNAL' as const;

  constructor() {
    super('Không thể khôi phục kết quả giao dịch đã ghi nhận.', 'IDEMPOTENCY_REPLAY_INVALID');
  }
}
