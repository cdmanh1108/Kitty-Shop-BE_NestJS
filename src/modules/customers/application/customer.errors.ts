import { ApplicationError } from '@common/errors/application-error';

export class CustomerNotFoundError extends ApplicationError {
  constructor() {
    super('Không tìm thấy khách hàng.');
  }
}

export class CustomerAddressNotFoundError extends ApplicationError {
  constructor() {
    super('Không tìm thấy địa chỉ khách hàng.');
  }
}
