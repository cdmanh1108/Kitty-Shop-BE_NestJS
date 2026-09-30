import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { CatalogInvariantError } from '../domain/catalog.repository';
import { mapCatalogErrorToHttpStatus } from './catalog-error-http.mapper';

export async function withCatalogInvariant<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CatalogInvariantError) {
      const body = { code: error.code, message: error.message };
      switch (mapCatalogErrorToHttpStatus(error.code)) {
        case HttpStatus.NOT_FOUND:
          throw new NotFoundException(body);
        case HttpStatus.CONFLICT:
          throw new ConflictException(body);
        default:
          throw new BadRequestException(body);
      }
    }
    throw error;
  }
}
