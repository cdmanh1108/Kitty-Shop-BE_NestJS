import { ApplicationError } from '@common/errors/application-error';

export class FavoriteProductNotFoundError extends ApplicationError {
  constructor() {
    super('Không tìm thấy sản phẩm.');
  }
}
