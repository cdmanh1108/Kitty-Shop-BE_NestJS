import { parseLegacyBoolean } from './legacy-catalog.normalizer';
import { parseLegacyColors } from './legacy-color.parser';
import type { LegacyProductRow } from './legacy-xlsx.parser';

export interface PlannedInventoryItem {
  sku: string;
  currentStatus: string;
  condition: string;
  notes?: string | null;
}

export interface PlannedRentalRate {
  durationDays: number;
  price: number;
  currency: string;
}

export interface PlannedMedia {
  url: string;
  altText: string;
  isPrimary: boolean;
  sortOrder: number;
  metadata?: Record<string, unknown>;
}

export interface PlannedVariant {
  variantCode: string;
  sizeId: string | null;
  colorId: string | null;
  sizeName: string | null;
  colorName: string | null;
  depositAmountOverride: null;
  rentalRates: PlannedRentalRate[];
  inventoryItems: PlannedInventoryItem[];
  unresolvedAllocationCount: number;
}

export interface PlannedProduct {
  sourceRow: number;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string | null;
  defaultDepositAmount: number;
  currency: string;
  status: string;
  isRentable: boolean;
  isPublic: boolean;
  metadata: Record<string, unknown>;
  variants: PlannedVariant[];
  media: PlannedMedia[];
  totalLegacyQuantity: number;
  allocatedInventoryCount: number;
  unallocatedInventoryCount: number;
}

export interface MasterLookups {
  categoryByName: Map<string, { id: string; code: string; name: string }>;
  sizeByName: Map<string, { id: string; code: string; name: string }>;
  colorByCode: Map<string, { id: string; code: string; name: string }>;
}

/**
 * Builds a deterministic variant code:
 * Format: {productCode}-{sizeCode}-{colorCode}
 * e.g. SP001-M-DO, SP040-M-DEFAULT
 */
export function buildVariantCode(
  productCode: string,
  sizeCode?: string,
  colorCode?: string,
): string {
  const s = sizeCode ? sizeCode.toUpperCase() : 'ONESIZE';
  const c = colorCode ? colorCode.toUpperCase() : 'DEFAULT';
  return `${productCode}-${s}-${c}`;
}

/**
 * Builds a deterministic InventoryItem SKU:
 * Format: {variantCode}-{index3Digits}
 * e.g. SP001-M-DO-001, SP022-M-TRANG-002
 */
export function buildInventorySku(variantCode: string, index: number): string {
  return `${variantCode}-${String(index).padStart(3, '0')}`;
}

/**
 * Maps a validated legacy product row into planned domain structures.
 */
export function mapLegacyProductRow(row: LegacyProductRow, lookups: MasterLookups): PlannedProduct {
  const cat = lookups.categoryByName.get(row.productGroup.trim().toLowerCase());
  if (!cat) {
    throw new Error(`Không tìm thấy nhóm "${row.productGroup}" trong dữ liệu danh mục.`);
  }

  const activeBool = parseLegacyBoolean(row.rawActive);
  const isRentable = activeBool ?? true;
  const status = isRentable ? 'ACTIVE' : 'INACTIVE';
  const depositAmount = row.depositAmount ?? 0;
  const rentalPrice = row.rentalPrice ?? 50000;
  const totalLegacyQuantity = row.quantity ?? 0;

  // Resolve size
  let sizeRecord: { id: string; code: string; name: string } | undefined;
  if (row.size) {
    sizeRecord = lookups.sizeByName.get(row.size.trim().toLowerCase());
  }

  // Parse colors
  const colorResult = parseLegacyColors(row.rawColor);
  const parsedColors = colorResult.colors;

  // Plan variants
  const variants: PlannedVariant[] = [];

  if (parsedColors.length > 1) {
    // Multi-color row (e.g. SP068: [Đỏ, Trắng], SP075: [Trắng, Hồng])
    for (const color of parsedColors) {
      const colorRecord = lookups.colorByCode.get(color.code);
      const variantCode = buildVariantCode(row.productCode, sizeRecord?.code, color.code);
      variants.push({
        variantCode,
        sizeId: sizeRecord?.id ?? null,
        colorId: colorRecord?.id ?? null,
        sizeName: sizeRecord?.name ?? null,
        colorName: color.name,
        depositAmountOverride: null,
        rentalRates: [
          {
            durationDays: 1,
            price: rentalPrice,
            currency: 'VND',
          },
        ],
        inventoryItems: [],
        unresolvedAllocationCount: 0,
      });
    }
  } else {
    // Single color or no color
    const singleColor = parsedColors[0];
    const colorRecord = singleColor ? lookups.colorByCode.get(singleColor.code) : undefined;
    const variantCode = buildVariantCode(row.productCode, sizeRecord?.code, singleColor?.code);

    variants.push({
      variantCode,
      sizeId: sizeRecord?.id ?? null,
      colorId: colorRecord?.id ?? null,
      sizeName: sizeRecord?.name ?? null,
      colorName: singleColor?.name ?? null,
      depositAmountOverride: null,
      rentalRates: [
        {
          durationDays: 1,
          price: rentalPrice,
          currency: 'VND',
        },
      ],
      inventoryItems: [],
      unresolvedAllocationCount: 0,
    });
  }

  // Plan physical inventory allocation
  let allocatedCount = 0;
  let unallocatedCount = 0;

  if (totalLegacyQuantity > 0) {
    if (variants.length === 1) {
      // Single variant: All physical items belong to this variant
      const targetVariant = variants[0]!;
      for (let i = 1; i <= totalLegacyQuantity; i++) {
        targetVariant.inventoryItems.push({
          sku: buildInventorySku(targetVariant.variantCode, i),
          currentStatus: 'AVAILABLE',
          condition: 'GOOD',
          notes: 'Legacy import',
        });
        allocatedCount++;
      }
    } else if (variants.length === totalLegacyQuantity) {
      // 1 item per variant if quantity matches variant count exactly
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]!;
        v.inventoryItems.push({
          sku: buildInventorySku(v.variantCode, 1),
          currentStatus: 'AVAILABLE',
          condition: 'GOOD',
          notes: 'Legacy import',
        });
        allocatedCount++;
      }
    } else {
      // Multi-color with ambiguous quantity (e.g. quantity = 1, variants = 2)
      // As per domain rule: Do not guess, do not inflate stock, record as unallocated
      unallocatedCount = totalLegacyQuantity;
      for (const v of variants) {
        v.unresolvedAllocationCount = totalLegacyQuantity;
      }
    }
  }

  // Plan media
  const media: PlannedMedia[] = [];
  if (row.imageUrl) {
    media.push({
      url: row.imageUrl,
      altText: row.productName,
      isPrimary: true,
      sortOrder: 0,
      metadata: {
        legacyFileId: row.imageFileId,
        legacyFileName: row.imageFileName,
      },
    });
  }

  // Structured legacy import metadata
  const metadata: Record<string, unknown> = {
    legacyImport: {
      source: 'KITTY_LEGACY_XLSX',
      sourceRow: row.sourceRow,
      productCode: row.productCode,
      classification: row.classification,
      searchKeyword: row.searchKeyword,
      rawColor: row.rawColor,
      rawActive: row.rawActive,
      importedAt: new Date().toISOString(),
    },
  };

  return {
    sourceRow: row.sourceRow,
    code: row.productCode,
    name: row.productName,
    categoryId: cat.id,
    categoryName: cat.name,
    description: row.note,
    defaultDepositAmount: depositAmount,
    currency: 'VND',
    status,
    isRentable,
    isPublic: false,
    metadata,
    variants,
    media,
    totalLegacyQuantity,
    allocatedInventoryCount: allocatedCount,
    unallocatedInventoryCount: unallocatedCount,
  };
}
