import { ApplicationError } from '@common/errors/application-error';

export class CustomerPhoneAlreadyExistsError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor(public readonly existingCustomerId?: string) {
    super(
      'Số điện thoại khách hàng đã tồn tại.',
      'CUSTOMER_PHONE_ALREADY_EXISTS',
      existingCustomerId ? { existingCustomerId } : undefined,
    );
  }
}

/** A profile owns the phone key but is not eligible for an unauthenticated booking. */
export class BookingCustomerUnavailableError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor() {
    super(
      'Không thể sử dụng thông tin khách hàng này để đặt thuê. Vui lòng liên hệ cửa hàng.',
      'BOOKING_CUSTOMER_UNAVAILABLE',
      undefined,
      { includeCodeAndMessageInDetails: false },
    );
  }
}
