import { Module } from '@nestjs/common';
import { AdminCatalogController } from './api/admin/admin-catalog.controller';
import { WebCatalogController } from './api/web/web-catalog.controller';
import { CatalogService } from './application/catalog.service';
import { WebCatalogService } from './application/web-catalog.service';
import { CATALOG_ADMIN_REPOSITORY } from './domain/catalog-admin.repository';
import { CATALOG_INVENTORY_REPOSITORY } from './domain/catalog-inventory.repository';
import { CATALOG_MANAGEMENT_REPOSITORY } from './domain/catalog-management.repository';
import { CATALOG_PRODUCT_REPOSITORY } from './domain/catalog-product.repository';
import { STOREFRONT_CATALOG_REPOSITORY } from './domain/storefront-catalog.repository';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository';

@Module({
  controllers: [AdminCatalogController, WebCatalogController],
  providers: [
    CatalogService,
    WebCatalogService,
    PrismaCatalogRepository,
    { provide: CATALOG_ADMIN_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: CATALOG_MANAGEMENT_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: CATALOG_PRODUCT_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: CATALOG_INVENTORY_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: STOREFRONT_CATALOG_REPOSITORY, useExisting: PrismaCatalogRepository },
  ],
  exports: [
    CatalogService,
    WebCatalogService,
    CATALOG_ADMIN_REPOSITORY,
    CATALOG_MANAGEMENT_REPOSITORY,
    CATALOG_PRODUCT_REPOSITORY,
    CATALOG_INVENTORY_REPOSITORY,
    STOREFRONT_CATALOG_REPOSITORY,
  ],
})
export class CatalogModule {}
