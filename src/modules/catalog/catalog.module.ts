import { Module } from '@nestjs/common';
import { AdminCatalogController } from './api/admin/admin-catalog.controller';
import { WebCatalogController } from './api/web/web-catalog.controller';
import { CatalogService } from './application/catalog.service';
import { CATALOG_REPOSITORY } from './domain/catalog.repository';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository';

@Module({
  controllers: [AdminCatalogController, WebCatalogController],
  providers: [
    CatalogService,
    PrismaCatalogRepository,
    { provide: CATALOG_REPOSITORY, useExisting: PrismaCatalogRepository },
  ],
  exports: [CatalogService, CATALOG_REPOSITORY],
})
export class CatalogModule {}
