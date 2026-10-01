import { ApplicationError } from '@common/errors/application-error';

export class InvalidShopSettingsError extends ApplicationError {}

export class ShopNotFoundError extends ApplicationError {
  constructor() {
    super('Không tìm thấy cửa hàng.');
  }
}
