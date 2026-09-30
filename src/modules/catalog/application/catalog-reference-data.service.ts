import type { CurrentUser } from '@common/types/current-user';
import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_REFERENCE_DATA_REPOSITORY,
  type CatalogReferenceDataRepository,
} from '../domain/catalog-reference-data.repository';
import type { CreateColorInput, CreateSizeInput } from './catalog.contracts';

@Injectable()
export class CatalogReferenceDataService {
  constructor(
    @Inject(CATALOG_REFERENCE_DATA_REPOSITORY)
    private readonly repository: CatalogReferenceDataRepository,
  ) {}

  lookups(user: CurrentUser) {
    return this.repository.listLookups(user.shopId);
  }

  createSize(user: CurrentUser, input: CreateSizeInput) {
    return this.repository.createSize(user.shopId, input);
  }

  createColor(user: CurrentUser, input: CreateColorInput) {
    return this.repository.createColor(user.shopId, input);
  }
}
