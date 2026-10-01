import { ApplicationError } from '@common/errors/application-error';

export class CatalogResourceNotFoundError extends ApplicationError {}

export class InvalidCatalogInputError extends ApplicationError {}

export class DuplicateProductVariantCombinationError extends ApplicationError {}

export class CategoryInUseError extends ApplicationError {
  constructor() {
    super('Danh mục đang được sử dụng bởi sản phẩm.', 'CATEGORY_IN_USE');
  }
}
