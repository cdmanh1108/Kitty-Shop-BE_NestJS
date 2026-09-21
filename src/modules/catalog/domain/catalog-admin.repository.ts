import type { CatalogInventoryRepository } from './catalog-inventory.repository';
import type { CatalogManagementRepository } from './catalog-management.repository';
import type { CatalogProductRepository } from './catalog-product.repository';

/** Aggregate consumed by the existing admin facade only. */
export type CatalogAdminRepository = CatalogManagementRepository &
  CatalogProductRepository &
  CatalogInventoryRepository;
export const CATALOG_ADMIN_REPOSITORY = Symbol('CATALOG_ADMIN_REPOSITORY');
