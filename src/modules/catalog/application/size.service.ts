import type { CurrentUser } from '@common/types/current-user';
import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_SIZE_REPOSITORY,
  type CatalogSizeRepository,
} from '../domain/catalog-size.repository';
import type { CreateSizeInput } from './catalog.contracts';

@Injectable()
export class SizeService {
  constructor(
    @Inject(CATALOG_SIZE_REPOSITORY) private readonly repository: CatalogSizeRepository,
  ) {}

  createSize(user: CurrentUser, input: CreateSizeInput) {
    return this.repository.createSize(user.shopId, input);
  }
}
