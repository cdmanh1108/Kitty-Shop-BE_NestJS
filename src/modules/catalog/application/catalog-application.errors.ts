import { ApplicationError } from '@common/errors/application-error';

export class CatalogResourceNotFoundError extends ApplicationError {
  readonly kind = 'NOT_FOUND' as const;
}

export class InvalidCatalogInputError extends ApplicationError {
  readonly kind = 'VALIDATION' as const;
}

export class DuplicateProductVariantCombinationError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;
}

export class CategoryInUseError extends ApplicationError {
  readonly kind = 'CONFLICT' as const;

  constructor() {
    super('Danh mục đang được sử dụng bởi sản phẩm.', 'CATEGORY_IN_USE');
  }
}
