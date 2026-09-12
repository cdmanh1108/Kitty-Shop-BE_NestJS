import { validateLegacyRows } from '../../src/cli/legacy-catalog/legacy-catalog.validator';
import type {
  LegacyCategoryRow,
  LegacyProductRow,
} from '../../src/cli/legacy-catalog/legacy-xlsx.parser';

describe('Legacy Catalog Validator', () => {
  const masterCategories: LegacyCategoryRow[] = [
    { sourceRow: 11, name: 'Váy' },
    { sourceRow: 12, name: 'Đầm ngắn' },
    { sourceRow: 13, name: 'Bikini' },
  ];

  it('passes valid row and flags expected warnings', () => {
    const validRow: LegacyProductRow = {
      sourceRow: 11,
      productCode: 'SP001',
      productName: 'Váy hoa',
      productGroup: 'Váy',
      classification: 'Quần áo',
      size: 'M',
      rawColor: 'Đỏ',
      quantity: 1,
      rentalPrice: 50000,
      depositAmount: 200000,
      imageFileId: 'file-123',
      imageUrl: 'https://drive.google.com/img1',
      imageFileName: 'img1.jpg',
      searchKeyword: 'vay hoa',
      rawActive: 'Có',
      note: null,
    };

    const result = validateLegacyRows([validRow], masterCategories);
    expect(result.isValid).toBe(true);
    expect(result.fatalCount).toBe(0);
    expect(result.errorCount).toBe(0);
  });

  it('rejects row with missing product code or name with FATAL issue', () => {
    const invalidRow: LegacyProductRow = {
      sourceRow: 12,
      productCode: '',
      productName: 'Tên',
      productGroup: 'Váy',
      classification: null,
      size: null,
      rawColor: 'Đỏ',
      quantity: 1,
      rentalPrice: 50000,
      depositAmount: 0,
      imageFileId: null,
      imageUrl: 'https://example.com/1',
      imageFileName: null,
      searchKeyword: null,
      rawActive: 'Có',
      note: null,
    };

    const result = validateLegacyRows([invalidRow], masterCategories);
    expect(result.isValid).toBe(false);
    expect(result.fatalCount).toBeGreaterThan(0);
  });

  it('detects duplicate product codes as FATAL', () => {
    const row1: LegacyProductRow = {
      sourceRow: 11,
      productCode: 'SP001',
      productName: 'Product 1',
      productGroup: 'Váy',
      classification: null,
      size: 'M',
      rawColor: 'Đỏ',
      quantity: 1,
      rentalPrice: 50000,
      depositAmount: 0,
      imageFileId: null,
      imageUrl: 'https://example.com/1',
      imageFileName: null,
      searchKeyword: null,
      rawActive: 'Có',
      note: null,
    };
    const row2: LegacyProductRow = {
      ...row1,
      sourceRow: 12,
      productName: 'Product 2',
    };

    const result = validateLegacyRows([row1, row2], masterCategories);
    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.code === 'DUPLICATE_PRODUCT_CODE')).toBe(true);
  });

  it('flags category not declared in master sheet ("Đầm") with WARNING without blocking import', () => {
    const damRow: LegacyProductRow = {
      sourceRow: 15,
      productCode: 'SP017',
      productName: 'Đầm xòe',
      productGroup: 'Đầm', // not in masterCategories
      classification: 'Quần áo',
      size: 'M',
      rawColor: 'Trắng',
      quantity: 1,
      rentalPrice: 50000,
      depositAmount: 200000,
      imageFileId: null,
      imageUrl: 'https://example.com/dam',
      imageFileName: null,
      searchKeyword: null,
      rawActive: 'Có',
      note: null,
    };

    const result = validateLegacyRows([damRow], masterCategories);
    expect(result.isValid).toBe(true); // Still valid to import
    expect(result.issues.some((i) => i.code === 'CATEGORY_NOT_DECLARED_IN_MASTER_SHEET')).toBe(
      true,
    );
  });

  it('flags zero inventory with WARNING (ACTIVE_PRODUCT_WITH_ZERO_INVENTORY)', () => {
    const zeroQtyRow: LegacyProductRow = {
      sourceRow: 50,
      productCode: 'SP040',
      productName: 'Áo 2 dây',
      productGroup: 'Váy',
      classification: 'Quần áo',
      size: 'M',
      rawColor: 1,
      quantity: 0,
      rentalPrice: 30000,
      depositAmount: 200000,
      imageFileId: null,
      imageUrl: 'https://example.com/sp40',
      imageFileName: null,
      searchKeyword: null,
      rawActive: 'Có',
      note: null,
    };

    const result = validateLegacyRows([zeroQtyRow], masterCategories);
    expect(result.isValid).toBe(true);
    expect(result.issues.some((i) => i.code === 'ACTIVE_PRODUCT_WITH_ZERO_INVENTORY')).toBe(true);
    expect(result.issues.some((i) => i.code === 'INVALID_COLOR_VALUE')).toBe(true);
  });

  it('flags multi-color with quantity = 1 with REVIEW_REQUIRED', () => {
    const multiColorRow: LegacyProductRow = {
      sourceRow: 85,
      productCode: 'SP075',
      productName: 'Đầm hoa nhí trắng hồng',
      productGroup: 'Đầm ngắn',
      classification: 'Quần áo',
      size: 'S',
      rawColor: 'Trắng, Hồng',
      quantity: 1, // 2 colors but Qty = 1
      rentalPrice: 50000,
      depositAmount: 200000,
      imageFileId: null,
      imageUrl: 'https://example.com/sp75',
      imageFileName: null,
      searchKeyword: null,
      rawActive: 'Có',
      note: null,
    };

    const result = validateLegacyRows([multiColorRow], masterCategories);
    expect(result.isValid).toBe(true);
    expect(result.issues.some((i) => i.code === 'INVENTORY_ALLOCATION_REVIEW_REQUIRED')).toBe(true);
  });
});
