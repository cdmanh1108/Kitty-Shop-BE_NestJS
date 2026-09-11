import {
  buildInventorySku,
  buildVariantCode,
  mapLegacyProductRow,
  type MasterLookups,
} from '../../src/modules/catalog/infrastructure/import/legacy-catalog.mapper';
import type { LegacyProductRow } from '../../src/modules/catalog/infrastructure/import/legacy-xlsx.parser';

describe('Legacy Catalog Mapper', () => {
  const mockLookups: MasterLookups = {
    categoryByName: new Map([
      ['váy', { id: 'cat-1', code: 'VAY', name: 'Váy' }],
      ['đầm ngắn', { id: 'cat-2', code: 'DAM_NGAN', name: 'Đầm ngắn' }],
      ['đầm', { id: 'cat-3', code: 'DAM', name: 'Đầm' }],
    ]),
    sizeByName: new Map([
      ['m', { id: 'size-m', code: 'M', name: 'M' }],
      ['s', { id: 'size-s', code: 'S', name: 'S' }],
    ]),
    colorByCode: new Map([
      ['DO', { id: 'color-do', code: 'DO', name: 'Đỏ' }],
      ['TRANG', { id: 'color-trang', code: 'TRANG', name: 'Trắng' }],
      ['HONG', { id: 'color-hong', code: 'HONG', name: 'Hồng' }],
    ]),
  };

  it('generates deterministic variant code and inventory SKU', () => {
    expect(buildVariantCode('SP001', 'M', 'DO')).toBe('SP001-M-DO');
    expect(buildVariantCode('SP040', 'M', undefined)).toBe('SP040-M-DEFAULT');
    expect(buildInventorySku('SP001-M-DO', 1)).toBe('SP001-M-DO-001');
    expect(buildInventorySku('SP001-M-DO', 2)).toBe('SP001-M-DO-002');
  });

  it('maps single-color row with quantity = 1 into 1 Variant and 1 InventoryItem', () => {
    const row: LegacyProductRow = {
      sourceRow: 11,
      productCode: 'SP001',
      productName: 'Váy đỏ',
      productGroup: 'Váy',
      classification: 'Quần áo',
      size: 'M',
      rawColor: 'Đỏ',
      quantity: 1,
      rentalPrice: 50000,
      depositAmount: 200000,
      imageFileId: 'id-1',
      imageUrl: 'https://example.com/1.jpg',
      imageFileName: '1.jpg',
      searchKeyword: 'vay do',
      rawActive: 'Có',
      note: 'Note 1',
    };

    const planned = mapLegacyProductRow(row, mockLookups);
    expect(planned.code).toBe('SP001');
    expect(planned.name).toBe('Váy đỏ');
    expect(planned.categoryId).toBe('cat-1');
    expect(planned.defaultDepositAmount).toBe(200000);
    expect(planned.variants).toHaveLength(1);
    expect(planned.variants[0]?.variantCode).toBe('SP001-M-DO');
    expect(planned.variants[0]?.rentalRates).toHaveLength(1);
    expect(planned.variants[0]?.rentalRates[0]?.price).toBe(50000);
    expect(planned.variants[0]?.inventoryItems).toHaveLength(1);
    expect(planned.variants[0]?.inventoryItems[0]?.sku).toBe('SP001-M-DO-001');
    expect(planned.allocatedInventoryCount).toBe(1);
    expect(planned.unallocatedInventoryCount).toBe(0);
  });

  it('maps single-color row with quantity = 2 into 1 Variant and 2 InventoryItems', () => {
    const row: LegacyProductRow = {
      sourceRow: 32,
      productCode: 'SP022',
      productName: 'Set đầm trắng',
      productGroup: 'Váy',
      classification: 'Quần áo',
      size: 'M',
      rawColor: 'Trắng',
      quantity: 2,
      rentalPrice: 50000,
      depositAmount: 200000,
      imageFileId: null,
      imageUrl: 'https://example.com/22.jpg',
      imageFileName: null,
      searchKeyword: null,
      rawActive: 'Có',
      note: null,
    };

    const planned = mapLegacyProductRow(row, mockLookups);
    expect(planned.variants).toHaveLength(1);
    expect(planned.variants[0]?.inventoryItems).toHaveLength(2);
    expect(planned.variants[0]?.inventoryItems[0]?.sku).toBe('SP022-M-TRANG-001');
    expect(planned.variants[0]?.inventoryItems[1]?.sku).toBe('SP022-M-TRANG-002');
    expect(planned.allocatedInventoryCount).toBe(2);
    expect(planned.unallocatedInventoryCount).toBe(0);
  });

  it('maps quantity = 0 row with 1 Variant and 0 InventoryItems', () => {
    const row: LegacyProductRow = {
      sourceRow: 50,
      productCode: 'SP040',
      productName: 'Áo 2 dây',
      productGroup: 'Váy',
      classification: 'Quần áo',
      size: 'M',
      rawColor: 1, // Invalid numeric color
      quantity: 0,
      rentalPrice: 30000,
      depositAmount: 200000,
      imageFileId: null,
      imageUrl: 'https://example.com/40.jpg',
      imageFileName: null,
      searchKeyword: null,
      rawActive: 'Có',
      note: null,
    };

    const planned = mapLegacyProductRow(row, mockLookups);
    expect(planned.variants).toHaveLength(1);
    expect(planned.variants[0]?.variantCode).toBe('SP040-M-DEFAULT');
    expect(planned.variants[0]?.colorId).toBeNull();
    expect(planned.variants[0]?.inventoryItems).toHaveLength(0);
    expect(planned.allocatedInventoryCount).toBe(0);
    expect(planned.unallocatedInventoryCount).toBe(0);
  });

  it('expands multi-color row into 2 Variants WITHOUT inflating physical quantity when Qty = 1', () => {
    const row: LegacyProductRow = {
      sourceRow: 85,
      productCode: 'SP075',
      productName: 'Đầm hoa nhí trắng hồng',
      productGroup: 'Đầm ngắn',
      classification: 'Quần áo',
      size: 'S',
      rawColor: 'Trắng, Hồng',
      quantity: 1, // Ambiguity: 1 physical item, 2 variants
      rentalPrice: 50000,
      depositAmount: 200000,
      imageFileId: null,
      imageUrl: 'https://example.com/75.jpg',
      imageFileName: null,
      searchKeyword: null,
      rawActive: 'Có',
      note: null,
    };

    const planned = mapLegacyProductRow(row, mockLookups);
    expect(planned.variants).toHaveLength(2);
    expect(planned.variants[0]?.variantCode).toBe('SP075-S-TRANG');
    expect(planned.variants[1]?.variantCode).toBe('SP075-S-HONG');

    // Invariant: Do NOT create 2 items, do NOT allocate blindly to the first variant
    expect(planned.variants[0]?.inventoryItems).toHaveLength(0);
    expect(planned.variants[1]?.inventoryItems).toHaveLength(0);
    expect(planned.allocatedInventoryCount).toBe(0);
    expect(planned.unallocatedInventoryCount).toBe(1);
    expect(planned.totalLegacyQuantity).toBe(1);
  });
});
