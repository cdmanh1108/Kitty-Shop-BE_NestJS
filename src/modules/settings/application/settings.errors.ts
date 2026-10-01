import { ApplicationError } from '@common/errors/application-error';

export class InvalidShopSettingsError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}

export class ShopNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;

  constructor() {
    super('Không tìm thấy cửa hàng.');
  }
}
