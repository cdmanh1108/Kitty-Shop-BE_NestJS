import { ApplicationError } from '@common/errors/application-error';

export class ReminderRefreshAlreadyRunningError extends ApplicationError {
  constructor() {
    super('Đang có tiến trình làm mới lời nhắc cho cửa hàng này.');
  }
}

export class ReminderNotFoundError extends ApplicationError {
  constructor() {
    super('Không tìm thấy lời nhắc.');
  }
}
