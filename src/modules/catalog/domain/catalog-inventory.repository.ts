import type { InventoryHistoryCriteria, InventoryHistoryPage, InventorySummary } from './catalog.read-models';
import type { AddInventoryItemResult, FindAvailableInventoryResult, InventoryDetails, InventoryPage } from './catalog.models';
import type { AddInventoryData, CatalogFindAvailableInventoryCriteria, CatalogListInventoryCriteria, CatalogUpdateInventoryStatusData } from './catalog.repository';

export const CATALOG_INVENTORY_REPOSITORY = Symbol('CATALOG_INVENTORY_REPOSITORY');

/** Inventory availability, state transitions and history. */
export interface CatalogInventoryRepository {
  inventorySummary(shopId: string): Promise<InventorySummary>;
  inventoryHistory(input: InventoryHistoryCriteria): Promise<InventoryHistoryPage>;
  addInventoryItem(shopId: string, input: AddInventoryData): Promise<AddInventoryItemResult>;
  updateInventoryStatus(input: CatalogUpdateInventoryStatusData): Promise<AddInventoryItemResult>;
  archiveInventoryItem(shopId: string, id: string, reason?: string, changedBy?: string): Promise<boolean>;
  listInventory(input: CatalogListInventoryCriteria): Promise<InventoryPage>;
  findInventoryItem(shopId: string, id: string): Promise<InventoryDetails>;
  findAvailableInventory(input: CatalogFindAvailableInventoryCriteria): Promise<FindAvailableInventoryResult>;
}
