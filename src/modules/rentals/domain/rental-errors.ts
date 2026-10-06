import { ApplicationError } from '@common/errors/application-error';

export class RentalInvariantError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;

  constructor(code: string, message: string) {
    super(message, code, undefined, { includeCodeAndMessageInDetails: false });
  }
}

export class InvalidRentalIntervalError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;

  constructor() {
    super('Khoảng thời gian thuê không hợp lệ.', 'INVALID_RENTAL_INTERVAL', undefined, {
      includeCodeAndMessageInDetails: false,
    });
  }
}

export class RentalClaimLostError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor() {
    super('Yêu cầu này đang được xử lý. Vui lòng chờ và thử lại.', 'RENTAL_CLAIM_LOST', undefined, {
      includeCodeAndMessageInDetails: false,
    });
  }
}

export class RentalInventoryUnavailableError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor(
    message = 'Một hoặc nhiều món đồ hiện không sẵn sàng hoặc không còn được phép cho thuê.',
  ) {
    super(message, 'RENTAL_INVENTORY_UNAVAILABLE', undefined, {
      includeCodeAndMessageInDetails: false,
    });
  }
}

export class RentalOverlapError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor() {
    super(
      'Một hoặc nhiều món đồ không còn trống trong khoảng thời gian đã chọn.',
      'RENTAL_OVERLAP',
      undefined,
      { includeCodeAndMessageInDetails: false },
    );
  }
}

export class RentalFeePreviewChangedError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;
  constructor() {
    super(
      'Thông tin phí hoặc số tiền đã thay đổi. Vui lòng tải lại và kiểm tra trước khi xác nhận.',
      'RENTAL_FEE_PREVIEW_CHANGED',
    );
  }
}
