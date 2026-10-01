import { ApplicationError } from '@common/errors/application-error';

export class ReminderRefreshAlreadyRunningError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor() {
    super('Đang có tiến trình làm mới lời nhắc cho cửa hàng này.');
  }
}

export class ReminderNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;

  constructor() {
    super('Không tìm thấy lời nhắc.');
  }
}
