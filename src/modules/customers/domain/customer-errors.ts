export class CustomerPhoneAlreadyExistsError extends Error {
  readonly code = 'CUSTOMER_PHONE_ALREADY_EXISTS';

  constructor(public readonly existingCustomerId?: string) {
    super('Số điện thoại khách hàng đã tồn tại.');
  }
}
