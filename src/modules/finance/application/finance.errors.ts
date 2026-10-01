import { ApplicationError } from '@common/errors/application-error';

export class InvalidPaymentCommandError extends ApplicationError {}

export class InvalidExpenseDetailsError extends ApplicationError {}

export class InvalidFinancePeriodError extends ApplicationError {}

export class FinanceRecordNotFoundError extends ApplicationError {}

export class ManualPaymentIdempotencyConflictError extends ApplicationError {
  constructor(code: string, message: string) {
    super(message, code);
  }
}

export class ManualPaymentReplayUnavailableError extends ApplicationError {
  constructor() {
    super('Không thể khôi phục kết quả giao dịch đã ghi nhận.', 'IDEMPOTENCY_REPLAY_INVALID');
  }
}
