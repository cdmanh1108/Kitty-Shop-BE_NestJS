import { ApplicationError } from '@common/errors/application-error';

export class CustomerNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;

  constructor() {
    super('Không tìm thấy khách hàng.');
  }
}

export class CustomerAddressNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;

  constructor() {
    super('Không tìm thấy địa chỉ khách hàng.');
  }
}
