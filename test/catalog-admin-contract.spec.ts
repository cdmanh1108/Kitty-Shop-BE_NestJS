import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';
import { PERMISSIONS } from '@common/constants/permissions';
import { PERMISSIONS_KEY } from '@common/decorators/permissions.decorator';
import { AdminCategoryController } from '@modules/catalog/api/admin/admin-category.controller';
import { AdminCatalogReferenceController } from '@modules/catalog/api/admin/admin-catalog-reference.controller';
import { AdminColorController } from '@modules/catalog/api/admin/admin-color.controller';
import { AdminSizeController } from '@modules/catalog/api/admin/admin-size.controller';
import { AdminInventoryController } from '@modules/catalog/api/admin/admin-inventory.controller';
import { AdminProductController } from '@modules/catalog/api/admin/admin-product.controller';

type HttpMethod = 'get' | 'post' | 'patch' | 'delete';
type RouteContract = {
  path: string;
  method: HttpMethod;
  controller: { prototype: object };
  handler: string;
  permission: string;
};

const routeContracts: RouteContract[] = [
  {
    path: '/admin/catalog/lookups',
    method: 'get',
    controller: AdminCatalogReferenceController,
    handler: 'lookups',
    permission: PERMISSIONS.CATALOG_VIEW,
  },
  {
    path: '/admin/catalog/categories',
    method: 'post',
    controller: AdminCategoryController,
    handler: 'createCategory',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/catalog/categories',
    method: 'get',
    controller: AdminCategoryController,
    handler: 'listCategories',
    permission: PERMISSIONS.CATALOG_VIEW,
  },
  {
    path: '/admin/catalog/categories/options',
    method: 'get',
    controller: AdminCategoryController,
    handler: 'categoryOptions',
    permission: PERMISSIONS.CATALOG_VIEW,
  },
  {
    path: '/admin/catalog/categories/{id}',
    method: 'patch',
    controller: AdminCategoryController,
    handler: 'updateCategory',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/catalog/categories/{id}',
    method: 'delete',
    controller: AdminCategoryController,
    handler: 'deleteCategory',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/catalog/sizes',
    method: 'post',
    controller: AdminSizeController,
    handler: 'createSize',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/catalog/colors',
    method: 'post',
    controller: AdminColorController,
    handler: 'createColor',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/catalog/colors',
    method: 'get',
    controller: AdminColorController,
    handler: 'listColors',
    permission: PERMISSIONS.CATALOG_VIEW,
  },
  {
    path: '/admin/catalog/colors/{id}',
    method: 'get',
    controller: AdminColorController,
    handler: 'getColor',
    permission: PERMISSIONS.CATALOG_VIEW,
  },
  {
    path: '/admin/catalog/colors/{id}',
    method: 'patch',
    controller: AdminColorController,
    handler: 'updateColor',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/catalog/colors/{id}/status',
    method: 'patch',
    controller: AdminColorController,
    handler: 'updateColorStatus',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/catalog/colors/{id}',
    method: 'delete',
    controller: AdminColorController,
    handler: 'deleteColor',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/products',
    method: 'get',
    controller: AdminProductController,
    handler: 'listProducts',
    permission: PERMISSIONS.CATALOG_VIEW,
  },
  {
    path: '/admin/products/lookup',
    method: 'get',
    controller: AdminProductController,
    handler: 'lookupProducts',
    permission: PERMISSIONS.CATALOG_VIEW,
  },
  {
    path: '/admin/products/{id}',
    method: 'get',
    controller: AdminProductController,
    handler: 'getProduct',
    permission: PERMISSIONS.CATALOG_VIEW,
  },
  {
    path: '/admin/products',
    method: 'post',
    controller: AdminProductController,
    handler: 'createProduct',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/products/{id}/variants',
    method: 'post',
    controller: AdminProductController,
    handler: 'addVariant',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/variants/{id}/rental-rates',
    method: 'post',
    controller: AdminProductController,
    handler: 'upsertRentalRate',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/products/{id}',
    method: 'patch',
    controller: AdminProductController,
    handler: 'updateProduct',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/products/{id}',
    method: 'delete',
    controller: AdminProductController,
    handler: 'archiveProduct',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/inventory',
    method: 'post',
    controller: AdminProductController,
    handler: 'addProductMedia',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/products/{id}/media/{mediaId}',
    method: 'delete',
    controller: AdminProductController,
    handler: 'removeProductMedia',
    permission: PERMISSIONS.CATALOG_MANAGE,
  },
  {
    path: '/admin/inventory',
    method: 'get',
    controller: AdminInventoryController,
    handler: 'listInventory',
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    path: '/admin/inventory/summary',
    method: 'get',
    controller: AdminInventoryController,
    handler: 'inventorySummary',
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    path: '/admin/inventory/history',
    method: 'get',
    controller: AdminInventoryController,
    handler: 'inventoryHistory',
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    path: '/admin/inventory/{id}',
    method: 'get',
    controller: AdminInventoryController,
    handler: 'getInventory',
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
  {
    path: '/admin/products/{id}/media',
    method: 'post',
    controller: AdminInventoryController,
    handler: 'addInventory',
    permission: PERMISSIONS.INVENTORY_MANAGE,
  },
  {
    path: '/admin/inventory/{id}/status',
    method: 'patch',
    controller: AdminInventoryController,
    handler: 'updateInventoryStatus',
    permission: PERMISSIONS.INVENTORY_MANAGE,
  },
  {
    path: '/admin/inventory/{id}',
    method: 'delete',
    controller: AdminInventoryController,
    handler: 'archiveInventoryItem',
    permission: PERMISSIONS.INVENTORY_MANAGE,
  },
  {
    path: '/admin/inventory/availability/search',
    method: 'get',
    controller: AdminInventoryController,
    handler: 'availability',
    permission: PERMISSIONS.INVENTORY_VIEW,
  },
];

describe('admin catalog API contract', () => {
  const document = JSON.parse(
    readFileSync(resolve(__dirname, '../generated/openapi.json'), 'utf8'),
  ) as OpenAPIObject;

  it('preserves every catalog method and route, with the existing bearer security', () => {
    for (const contract of routeContracts) {
      const operation = document.paths[contract.path]?.[contract.method];

      expect(operation).toBeDefined();
      expect(operation).toMatchObject({
        security: [{ 'access-token': [] }],
        'x-api-surface': 'admin',
      });
    }
  });

  it('preserves each route permission after moving it to its resource controller', () => {
    for (const contract of routeContracts) {
      const descriptor = Object.getOwnPropertyDescriptor(
        contract.controller.prototype,
        contract.handler,
      );
      const handler: unknown = descriptor?.value;
      if (typeof handler !== 'function') throw new Error('Missing handler for ' + contract.path);
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([contract.permission]);
    }
  });
});
