import type { LegacyImportIssue, ValidationResult } from './legacy-catalog.validator';

export interface LegacyImportOptions {
  filePath: string;
  shopCode: string;
  dryRun?: boolean;
  apply?: boolean;
}

export interface ReconciliationMetrics {
  totalProductRows: number;
  uniqueProductCodes: number;
  legacyQuantitySum: number;
  price50kCount: number;
  price30kCount: number;
  otherPriceCount: number;
  deposit200kCount: number;
  deposit0Count: number;
  otherDepositCount: number;
  imageUrlCount: number;
  activeCount: number;
}

export interface EntityMutationSummary {
  categoriesCreated: number;
  categoriesExisting: number;
  sizesCreated: number;
  sizesExisting: number;
  colorsCreated: number;
  colorsExisting: number;
  productsCreated: number;
  productsUnchanged: number;
  productsConflicted: number;
  variantsCreated: number;
  variantsUnchanged: number;
  inventoryItemsCreated: number;
  inventoryItemsUnchanged: number;
  rentalRatesCreated: number;
  rentalRatesUnchanged: number;
  mediaCreated: number;
  mediaUnchanged: number;
}

export interface UnallocatedInventoryItem {
  productCode: string;
  productName: string;
  quantity: number;
  variants: string[];
  reason: string;
}

export interface InventoryReconciliation {
  legacyTotalQuantity: number;
  importedPhysicalCount: number;
  unallocatedPhysicalCount: number;
  difference: number;
  unallocatedItems: UnallocatedInventoryItem[];
}

export interface LegacyImportReport {
  shopId: string;
  shopCode: string;
  mode: 'DRY_RUN' | 'APPLY';
  filePath: string;
  reconciliation: ReconciliationMetrics;
  inventory: InventoryReconciliation;
  mutations: EntityMutationSummary;
  validation: ValidationResult;
  issues: LegacyImportIssue[];
  durationMs: number;
  success: boolean;
}
