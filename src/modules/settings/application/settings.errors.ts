import { ApplicationError } from '@common/errors/application-error';

export class ShopNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;

  constructor() {
    super('Không tìm thấy cửa hàng.');
  }
}
