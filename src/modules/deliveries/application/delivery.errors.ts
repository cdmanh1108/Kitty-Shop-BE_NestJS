import { ApplicationError } from '@common/errors/application-error';

export class DeliveryOrderNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;

  constructor() {
    super('Không tìm thấy đơn thuê.');
  }
}

export class DeliveryNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;

  constructor() {
    super('Không tìm thấy công việc giao hàng.');
  }
}

export class InvalidDeliveryStatusError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;

  constructor() {
    super('Trạng thái giao hàng không hợp lệ.');
  }
}

export class DeliveryTransitionNotAllowedError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor() {
    super(
      'Không thể chuyển trạng thái giao hàng theo quy trình hiện tại.',
      'DELIVERY_INVALID_TRANSITION',
    );
  }
}

export class DeliveryChangedConcurrentlyError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor() {
    super(
      'Công việc giao hàng vừa được thay đổi. Vui lòng tải lại và thử lại.',
      'DELIVERY_CONCURRENT_MODIFICATION',
    );
  }
}
