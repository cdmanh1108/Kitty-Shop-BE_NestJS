import {
  PUBLIC_MEDIA_URL_RESOLVER,
  type PublicMediaUrlResolver,
} from '@common/storage/public-url.resolver';
import {
  inventorySummary,
  inventoryHistory,
  listInventory,
  findInventoryItem,
} from './inventory-queries';
import { PrismaService } from '@database/prisma/prisma.service';
import { Inject, Injectable } from '@nestjs/common';
import type { CatalogCategoryRepository } from '../domain/catalog-category.repository';
import type { CatalogColorRepository } from '../domain/catalog-color.repository';
import type { CatalogInventoryRepository } from '../domain/catalog-inventory.repository';
import type { CatalogProductRepository } from '../domain/catalog-product.repository';
import type { CatalogReferenceDataRepository } from '../domain/catalog-reference-data.repository';
import type { CatalogSizeRepository } from '../domain/catalog-size.repository';
import type { StorefrontCatalogRepository } from '../domain/storefront-catalog.repository';
type CatalogPersistenceAdapter = CatalogCategoryRepository &
  CatalogColorRepository &
  CatalogReferenceDataRepository &
  CatalogSizeRepository &
  CatalogProductRepository &
  CatalogInventoryRepository &
  StorefrontCatalogRepository;
type CatalogRepository = CatalogPersistenceAdapter;
import { listLookups } from './catalog-lookups';
import { listCategories, categoryOptions } from './category-queries';
import { createCategory, updateCategory, deleteCategory } from './category-commands';
import {
  createSize,
  deleteSize,
  findSizeByCode,
  findSizeById,
  isSizeInUse,
  updateSize,
  updateSizeStatus,
} from './size-commands';
import { listSizes } from './size-queries';
import {
  createColor,
  deleteColor,
  findColorByCode,
  findColorById,
  isColorInUse,
  updateColor,
  updateColorStatus,
} from './color-commands';
import { listColors } from './color-queries';
import {
  listProducts,
  findProduct,
  findProductMediaUploadTarget,
  countProductMediaByStorageKey,
  lookupProducts,
} from './product-queries';
import {
  createProduct,
  addVariant,
  upsertRentalRate,
  updateProduct,
  archiveProduct,
} from './product-commands';
import {
  addProductMedia,
  setPrimaryProductMedia,
  removeProductMedia,
} from './product-media-commands';
import {
  updateProductVariant,
  setProductVariantArchived,
  deleteProductVariant,
} from './product-variant-commands';
import { listStorefrontCategories } from './storefront-category.queries';
import { listStorefrontFilters } from './storefront-filter.queries';
import { listStorefrontProducts } from './storefront-product-list.queries';
import {
  listStorefrontProductsByIds,
  findStorefrontProductBySlug,
} from './storefront-product.queries';
import { resolveStorefrontSelections } from './storefront-selection.queries';
import {
  addInventoryItem,
  updateInventoryStatus,
  archiveInventoryItem,
} from './inventory-commands';

@Injectable()
export class PrismaCatalogRepository
  implements
    CatalogCategoryRepository,
    CatalogColorRepository,
    CatalogReferenceDataRepository,
    CatalogSizeRepository,
    CatalogProductRepository,
    CatalogInventoryRepository,
    StorefrontCatalogRepository
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUBLIC_MEDIA_URL_RESOLVER) private readonly mediaUrls: PublicMediaUrlResolver,
  ) {}

  listStorefrontCategories(
    shopId: string,
  ): ReturnType<CatalogPersistenceAdapter['listStorefrontCategories']> {
    return listStorefrontCategories(this.prisma, shopId);
  }

  listStorefrontProducts(
    input: Parameters<CatalogPersistenceAdapter['listStorefrontProducts']>[0],
  ): ReturnType<CatalogPersistenceAdapter['listStorefrontProducts']> {
    return listStorefrontProducts(this.prisma, this.mediaUrls, input);
  }

  listStorefrontFilters(
    input: Parameters<CatalogPersistenceAdapter['listStorefrontFilters']>[0],
  ): ReturnType<CatalogPersistenceAdapter['listStorefrontFilters']> {
    return listStorefrontFilters(this.prisma, input);
  }

  listStorefrontProductsByIds(
    shopId: string,
    productIds: string[],
  ): ReturnType<CatalogPersistenceAdapter['listStorefrontProductsByIds']> {
    return listStorefrontProductsByIds(this.prisma, this.mediaUrls, shopId, productIds);
  }

  findStorefrontProductBySlug(
    shopId: string,
    slug: string,
  ): ReturnType<CatalogPersistenceAdapter['findStorefrontProductBySlug']> {
    return findStorefrontProductBySlug(this.prisma, this.mediaUrls, shopId, slug);
  }

  resolveStorefrontSelections(
    input: Parameters<CatalogPersistenceAdapter['resolveStorefrontSelections']>[0],
  ): ReturnType<CatalogPersistenceAdapter['resolveStorefrontSelections']> {
    return resolveStorefrontSelections(this.prisma, this.mediaUrls, input);
  }

  lookupProducts(
    ...args: Parameters<CatalogRepository['lookupProducts']>
  ): ReturnType<CatalogRepository['lookupProducts']> {
    return lookupProducts(this.prisma, ...args);
  }

  inventorySummary(
    ...args: Parameters<CatalogRepository['inventorySummary']>
  ): ReturnType<CatalogRepository['inventorySummary']> {
    return inventorySummary(this.prisma, ...args);
  }

  inventoryHistory(
    ...args: Parameters<CatalogRepository['inventoryHistory']>
  ): ReturnType<CatalogRepository['inventoryHistory']> {
    return inventoryHistory(this.prisma, ...args);
  }

  listLookups(
    ...args: Parameters<CatalogRepository['listLookups']>
  ): ReturnType<CatalogRepository['listLookups']> {
    return listLookups(this.prisma, ...args);
  }
  listCategories(
    ...args: Parameters<CatalogRepository['listCategories']>
  ): ReturnType<CatalogRepository['listCategories']> {
    return listCategories(this.prisma, ...args);
  }
  categoryOptions(
    ...args: Parameters<CatalogRepository['categoryOptions']>
  ): ReturnType<CatalogRepository['categoryOptions']> {
    return categoryOptions(this.prisma, ...args);
  }

  createCategory(
    ...args: Parameters<CatalogRepository['createCategory']>
  ): ReturnType<CatalogRepository['createCategory']> {
    return createCategory(this.prisma, ...args);
  }
  updateCategory(
    ...args: Parameters<CatalogRepository['updateCategory']>
  ): ReturnType<CatalogRepository['updateCategory']> {
    return updateCategory(this.prisma, ...args);
  }
  deleteCategory(
    ...args: Parameters<CatalogRepository['deleteCategory']>
  ): ReturnType<CatalogRepository['deleteCategory']> {
    return deleteCategory(this.prisma, ...args);
  }

  createSize(
    ...args: Parameters<CatalogRepository['createSize']>
  ): ReturnType<CatalogRepository['createSize']> {
    return createSize(this.prisma, ...args);
  }
  listSizes(
    ...args: Parameters<CatalogRepository['listSizes']>
  ): ReturnType<CatalogRepository['listSizes']> {
    return listSizes(this.prisma, ...args);
  }
  findSizeById(
    ...args: Parameters<CatalogRepository['findSizeById']>
  ): ReturnType<CatalogRepository['findSizeById']> {
    return findSizeById(this.prisma, ...args);
  }
  findSizeByCode(
    ...args: Parameters<CatalogRepository['findSizeByCode']>
  ): ReturnType<CatalogRepository['findSizeByCode']> {
    return findSizeByCode(this.prisma, ...args);
  }
  updateSize(
    ...args: Parameters<CatalogRepository['updateSize']>
  ): ReturnType<CatalogRepository['updateSize']> {
    return updateSize(this.prisma, ...args);
  }
  updateSizeStatus(
    ...args: Parameters<CatalogRepository['updateSizeStatus']>
  ): ReturnType<CatalogRepository['updateSizeStatus']> {
    return updateSizeStatus(this.prisma, ...args);
  }
  isSizeInUse(
    ...args: Parameters<CatalogRepository['isSizeInUse']>
  ): ReturnType<CatalogRepository['isSizeInUse']> {
    return isSizeInUse(this.prisma, ...args);
  }
  deleteSize(
    ...args: Parameters<CatalogRepository['deleteSize']>
  ): ReturnType<CatalogRepository['deleteSize']> {
    return deleteSize(this.prisma, ...args);
  }

  createColor(
    ...args: Parameters<CatalogRepository['createColor']>
  ): ReturnType<CatalogRepository['createColor']> {
    return createColor(this.prisma, ...args);
  }
  listColors(
    ...args: Parameters<CatalogRepository['listColors']>
  ): ReturnType<CatalogRepository['listColors']> {
    return listColors(this.prisma, ...args);
  }
  findColorById(
    ...args: Parameters<CatalogRepository['findColorById']>
  ): ReturnType<CatalogRepository['findColorById']> {
    return findColorById(this.prisma, ...args);
  }
  findColorByCode(
    ...args: Parameters<CatalogRepository['findColorByCode']>
  ): ReturnType<CatalogRepository['findColorByCode']> {
    return findColorByCode(this.prisma, ...args);
  }
  updateColor(
    ...args: Parameters<CatalogRepository['updateColor']>
  ): ReturnType<CatalogRepository['updateColor']> {
    return updateColor(this.prisma, ...args);
  }
  updateColorStatus(
    ...args: Parameters<CatalogRepository['updateColorStatus']>
  ): ReturnType<CatalogRepository['updateColorStatus']> {
    return updateColorStatus(this.prisma, ...args);
  }
  isColorInUse(
    ...args: Parameters<CatalogRepository['isColorInUse']>
  ): ReturnType<CatalogRepository['isColorInUse']> {
    return isColorInUse(this.prisma, ...args);
  }
  deleteColor(
    ...args: Parameters<CatalogRepository['deleteColor']>
  ): ReturnType<CatalogRepository['deleteColor']> {
    return deleteColor(this.prisma, ...args);
  }

  listProducts(
    ...args: Parameters<CatalogRepository['listProducts']>
  ): ReturnType<CatalogRepository['listProducts']> {
    return listProducts(this.prisma, this.mediaUrls, ...args);
  }

  findProduct(
    ...args: Parameters<CatalogRepository['findProduct']>
  ): ReturnType<CatalogRepository['findProduct']> {
    return findProduct(this.prisma, this.mediaUrls, ...args);
  }

  createProduct(
    ...args: Parameters<CatalogRepository['createProduct']>
  ): ReturnType<CatalogRepository['createProduct']> {
    return createProduct(this.prisma, ...args);
  }

  addVariant(
    ...args: Parameters<CatalogRepository['addVariant']>
  ): ReturnType<CatalogRepository['addVariant']> {
    return addVariant(this.prisma, ...args);
  }

  updateProductVariant(
    ...args: Parameters<CatalogRepository['updateProductVariant']>
  ): ReturnType<CatalogRepository['updateProductVariant']> {
    return updateProductVariant(this.prisma, ...args);
  }

  setProductVariantArchived(
    ...args: Parameters<CatalogRepository['setProductVariantArchived']>
  ): ReturnType<CatalogRepository['setProductVariantArchived']> {
    return setProductVariantArchived(this.prisma, ...args);
  }

  deleteProductVariant(
    ...args: Parameters<CatalogRepository['deleteProductVariant']>
  ): ReturnType<CatalogRepository['deleteProductVariant']> {
    return deleteProductVariant(this.prisma, ...args);
  }

  upsertRentalRate(
    ...args: Parameters<CatalogRepository['upsertRentalRate']>
  ): ReturnType<CatalogRepository['upsertRentalRate']> {
    return upsertRentalRate(this.prisma, ...args);
  }

  updateProduct(
    ...args: Parameters<CatalogRepository['updateProduct']>
  ): ReturnType<CatalogRepository['updateProduct']> {
    return updateProduct(this.prisma, ...args);
  }

  archiveProduct(
    ...args: Parameters<CatalogRepository['archiveProduct']>
  ): ReturnType<CatalogRepository['archiveProduct']> {
    return archiveProduct(this.prisma, ...args);
  }

  addProductMedia(
    ...args: Parameters<CatalogRepository['addProductMedia']>
  ): ReturnType<CatalogRepository['addProductMedia']> {
    return addProductMedia(this.prisma, this.mediaUrls, ...args);
  }

  setPrimaryProductMedia(
    ...args: Parameters<CatalogRepository['setPrimaryProductMedia']>
  ): ReturnType<CatalogRepository['setPrimaryProductMedia']> {
    return setPrimaryProductMedia(this.prisma, this.mediaUrls, ...args);
  }

  findProductMediaUploadTarget(
    ...args: Parameters<CatalogRepository['findProductMediaUploadTarget']>
  ): ReturnType<CatalogRepository['findProductMediaUploadTarget']> {
    return findProductMediaUploadTarget(this.prisma, ...args);
  }

  countProductMediaByStorageKey(
    ...args: Parameters<CatalogRepository['countProductMediaByStorageKey']>
  ): ReturnType<CatalogRepository['countProductMediaByStorageKey']> {
    return countProductMediaByStorageKey(this.prisma, ...args);
  }

  removeProductMedia(
    ...args: Parameters<CatalogRepository['removeProductMedia']>
  ): ReturnType<CatalogRepository['removeProductMedia']> {
    return removeProductMedia(this.prisma, ...args);
  }

  addInventoryItem(
    ...args: Parameters<CatalogRepository['addInventoryItem']>
  ): ReturnType<CatalogRepository['addInventoryItem']> {
    return addInventoryItem(this.prisma, ...args);
  }

  updateInventoryStatus(
    ...args: Parameters<CatalogRepository['updateInventoryStatus']>
  ): ReturnType<CatalogRepository['updateInventoryStatus']> {
    return updateInventoryStatus(this.prisma, ...args);
  }

  archiveInventoryItem(
    ...args: Parameters<CatalogRepository['archiveInventoryItem']>
  ): ReturnType<CatalogRepository['archiveInventoryItem']> {
    return archiveInventoryItem(this.prisma, ...args);
  }

  listInventory(
    ...args: Parameters<CatalogRepository['listInventory']>
  ): ReturnType<CatalogRepository['listInventory']> {
    return listInventory(this.prisma, ...args);
  }

  findInventoryItem(
    ...args: Parameters<CatalogRepository['findInventoryItem']>
  ): ReturnType<CatalogRepository['findInventoryItem']> {
    return findInventoryItem(this.prisma, ...args);
  }
}
