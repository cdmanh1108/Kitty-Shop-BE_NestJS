export class CustomerPhoneAlreadyExistsError extends Error {
  readonly code = 'CUSTOMER_PHONE_ALREADY_EXISTS';

  constructor(public readonly existingCustomerId?: string) {
    super('Số điện thoại khách hàng đã tồn tại.');
  }
}

/** A profile owns the phone key but is not eligible for an unauthenticated booking. */
export class BookingCustomerUnavailableError extends Error {
  readonly code = 'BOOKING_CUSTOMER_UNAVAILABLE';

  constructor() {
    super('Không thể sử dụng thông tin khách hàng này để đặt thuê. Vui lòng liên hệ cửa hàng.');
  }
}
