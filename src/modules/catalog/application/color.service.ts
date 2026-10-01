import type { CurrentUser } from '@common/types/current-user';
import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOG_COLOR_REPOSITORY,
  type CatalogColorRepository,
} from '../domain/catalog-color.repository';
import type { CreateColorInput } from './catalog.contracts';

@Injectable()
export class ColorService {
  constructor(
    @Inject(CATALOG_COLOR_REPOSITORY) private readonly repository: CatalogColorRepository,
  ) {}

  createColor(user: CurrentUser, input: CreateColorInput) {
    return this.repository.createColor(user.shopId, input);
  }
}
