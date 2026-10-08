import { Module } from '@nestjs/common';
import { RentalsModule } from '@modules/rentals/rentals.module';
import { AdminCategoryController } from './api/admin/admin-category.controller';
import { AdminCatalogReferenceController } from './api/admin/admin-catalog-reference.controller';
import { AdminColorController } from './api/admin/admin-color.controller';
import { AdminSizeController } from './api/admin/admin-size.controller';
import { AdminInventoryController } from './api/admin/admin-inventory.controller';
import { AdminProductController } from './api/admin/admin-product.controller';
import { WebCatalogController } from './api/web/web-catalog.controller';
import { CategoryService } from './application/category.service';
import { CatalogReferenceDataService } from './application/catalog-reference-data.service';
import { ColorService } from './application/color.service';
import { SizeService } from './application/size.service';
import { InventoryService } from './application/inventory.service';
import { ProductService } from './application/product.service';
import { ProductMediaService } from './application/product-media.service';
import { WebCatalogService } from './application/web-catalog.service';
import { CATALOG_CATEGORY_REPOSITORY } from './domain/catalog-category.repository';
import { CATALOG_COLOR_REPOSITORY } from './domain/catalog-color.repository';
import { CATALOG_SIZE_REPOSITORY } from './domain/catalog-size.repository';
import { CATALOG_INVENTORY_REPOSITORY } from './domain/catalog-inventory.repository';
import { CATALOG_REFERENCE_DATA_REPOSITORY } from './domain/catalog-reference-data.repository';
import { CATALOG_PRODUCT_REPOSITORY } from './domain/catalog-product.repository';
import { STOREFRONT_CATALOG_REPOSITORY } from './domain/storefront-catalog.repository';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository';

@Module({
  imports: [RentalsModule],
  controllers: [
    AdminCategoryController,
    AdminCatalogReferenceController,
    AdminSizeController,
    AdminColorController,
    AdminProductController,
    AdminInventoryController,
    WebCatalogController,
  ],
  providers: [
    CategoryService,
    CatalogReferenceDataService,
    ColorService,
    SizeService,
    ProductService,
    ProductMediaService,
    InventoryService,
    WebCatalogService,
    PrismaCatalogRepository,
    { provide: CATALOG_CATEGORY_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: CATALOG_REFERENCE_DATA_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: CATALOG_COLOR_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: CATALOG_SIZE_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: CATALOG_PRODUCT_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: CATALOG_INVENTORY_REPOSITORY, useExisting: PrismaCatalogRepository },
    { provide: STOREFRONT_CATALOG_REPOSITORY, useExisting: PrismaCatalogRepository },
  ],
  exports: [STOREFRONT_CATALOG_REPOSITORY],
})
export class CatalogModule {}
