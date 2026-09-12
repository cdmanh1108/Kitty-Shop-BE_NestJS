import { inventorySummary, inventoryHistory } from './inventory-read-queries';
import { PrismaService } from '@database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { CatalogRepository } from '../domain/catalog.repository';
import { listLookups, createCategory, createSize, createColor } from './catalog-lookups';
import { listProducts, findProduct, lookupProducts } from './product-queries';
import {
  createProduct,
  addVariant,
  upsertRentalRate,
  updateProduct,
  archiveProduct,
  addProductMedia,
  removeProductMedia,
} from './product-commands';
import {
  addInventoryItem,
  updateInventoryStatus,
  archiveInventoryItem,
  listInventory,
  findInventoryItem,
  findAvailableInventory,
} from './inventory-persistence';

@Injectable()
export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  createCategory(
    ...args: Parameters<CatalogRepository['createCategory']>
  ): ReturnType<CatalogRepository['createCategory']> {
    return createCategory(this.prisma, ...args);
  }

  createSize(
    ...args: Parameters<CatalogRepository['createSize']>
  ): ReturnType<CatalogRepository['createSize']> {
    return createSize(this.prisma, ...args);
  }

  createColor(
    ...args: Parameters<CatalogRepository['createColor']>
  ): ReturnType<CatalogRepository['createColor']> {
    return createColor(this.prisma, ...args);
  }

  listProducts(
    ...args: Parameters<CatalogRepository['listProducts']>
  ): ReturnType<CatalogRepository['listProducts']> {
    return listProducts(this.prisma, ...args);
  }

  findProduct(
    ...args: Parameters<CatalogRepository['findProduct']>
  ): ReturnType<CatalogRepository['findProduct']> {
    return findProduct(this.prisma, ...args);
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
    return addProductMedia(this.prisma, ...args);
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

  findAvailableInventory(
    ...args: Parameters<CatalogRepository['findAvailableInventory']>
  ): ReturnType<CatalogRepository['findAvailableInventory']> {
    return findAvailableInventory(this.prisma, ...args);
  }
}
