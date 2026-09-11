import { Module } from '@nestjs/common';
import { CatalogController } from './api/catalog.controller';
import { CatalogService } from './application/catalog.service';
import { CATALOG_REPOSITORY } from './domain/catalog.repository';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository';

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogService,
    PrismaCatalogRepository,
    { provide: CATALOG_REPOSITORY, useExisting: PrismaCatalogRepository },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
