import { parseLegacyBoolean } from './legacy-catalog.normalizer';
import { parseLegacyColors } from './legacy-color.parser';
import type { LegacyCategoryRow, LegacyProductRow } from './legacy-xlsx.parser';

export type IssueSeverity = 'FATAL' | 'ERROR' | 'WARNING' | 'REVIEW_REQUIRED' | 'INFO';

export interface LegacyImportIssue {
  severity: IssueSeverity;
  code: string;
  sheet: string;
  row: number;
  productCode?: string;
  field?: string;
  rawValue?: unknown;
  message: string;
}

export interface ValidationResult {
  isValid: boolean; // false if any FATAL or ERROR issues exist
  fatalCount: number;
  errorCount: number;
  warningCount: number;
  reviewRequiredCount: number;
  issues: LegacyImportIssue[];
}

/**
 * Validates parsed workbook rows and reports typed anomalies.
 */
export function validateLegacyRows(
  products: LegacyProductRow[],
  masterCategories: LegacyCategoryRow[],
): ValidationResult {
  const issues: LegacyImportIssue[] = [];
  const masterCatSet = new Set(masterCategories.map((c) => c.name.trim().toLowerCase()));
  const seenProductCodes = new Set<string>();

  for (const p of products) {
    // 1. Mandatory Product Code
    if (!p.productCode || p.productCode.trim().length === 0) {
      issues.push({
        severity: 'FATAL',
        code: 'MISSING_REQUIRED_VALUE',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        field: 'Mã sản phẩm',
        rawValue: p.productCode,
        message: 'Mã sản phẩm không được để trống.',
      });
      continue;
    }

    // 2. Duplicate Product Code
    if (seenProductCodes.has(p.productCode)) {
      issues.push({
        severity: 'FATAL',
        code: 'DUPLICATE_PRODUCT_CODE',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Mã sản phẩm',
        rawValue: p.productCode,
        message: `Mã sản phẩm "${p.productCode}" bị trùng trong tệp Excel.`,
      });
    } else {
      seenProductCodes.add(p.productCode);
    }

    // 3. Product Name
    if (!p.productName || p.productName.trim().length === 0) {
      issues.push({
        severity: 'FATAL',
        code: 'MISSING_REQUIRED_VALUE',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Tên sản phẩm',
        rawValue: p.productName,
        message: 'Tên sản phẩm không được để trống.',
      });
    }

    // 4. Product Group / Category
    if (!p.productGroup || p.productGroup.trim().length === 0) {
      issues.push({
        severity: 'FATAL',
        code: 'MISSING_REQUIRED_VALUE',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Nhóm sản phẩm',
        rawValue: p.productGroup,
        message: 'Nhóm sản phẩm không được để trống.',
      });
    } else if (!masterCatSet.has(p.productGroup.trim().toLowerCase())) {
      // Category Đầm anomaly (e.g. SP017, SP064)
      issues.push({
        severity: 'WARNING',
        code: 'CATEGORY_NOT_DECLARED_IN_MASTER_SHEET',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Nhóm sản phẩm',
        rawValue: p.productGroup,
        message: `Nhóm "${p.productGroup}" được sản phẩm sử dụng nhưng chưa khai báo trong trang tính "Danh mục".`,
      });
    }

    // 5. Quantity validation
    if (p.quantity === null || p.quantity === undefined) {
      issues.push({
        severity: 'ERROR',
        code: 'INVALID_NUMBER',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Số lượng tổng',
        rawValue: p.quantity,
        message: 'Số lượng phải là số hợp lệ.',
      });
    } else if (p.quantity < 0) {
      issues.push({
        severity: 'FATAL',
        code: 'NEGATIVE_QUANTITY',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Số lượng tổng',
        rawValue: p.quantity,
        message: 'Số lượng không được âm.',
      });
    } else if (p.quantity === 0) {
      // SP040, SP047 anomaly
      issues.push({
        severity: 'WARNING',
        code: 'ACTIVE_PRODUCT_WITH_ZERO_INVENTORY',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Số lượng tổng',
        rawValue: p.quantity,
        message: 'Sản phẩm đang hoạt động nhưng không có món đồ trong kho.',
      });
    }

    // 6. Rental Price validation
    if (p.rentalPrice === null || p.rentalPrice === undefined) {
      issues.push({
        severity: 'ERROR',
        code: 'INVALID_PRICE',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Giá thuê mặc định',
        rawValue: p.rentalPrice,
        message: 'Giá thuê mặc định phải là số hợp lệ.',
      });
    } else if (p.rentalPrice < 0) {
      issues.push({
        severity: 'FATAL',
        code: 'INVALID_PRICE',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Giá thuê mặc định',
        rawValue: p.rentalPrice,
        message: 'Giá thuê không được âm.',
      });
    }

    // 7. Deposit Amount validation
    if (p.depositAmount === null || p.depositAmount === undefined) {
      issues.push({
        severity: 'ERROR',
        code: 'INVALID_DEPOSIT',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Tiền cọc mặc định',
        rawValue: p.depositAmount,
        message: 'Tiền cọc mặc định phải là số hợp lệ.',
      });
    } else if (p.depositAmount < 0) {
      issues.push({
        severity: 'FATAL',
        code: 'INVALID_DEPOSIT',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Tiền cọc mặc định',
        rawValue: p.depositAmount,
        message: 'Tiền cọc không được âm.',
      });
    }

    // 8. Color validation & multi-color check
    const colorResult = parseLegacyColors(p.rawColor);
    if (!colorResult.valid) {
      issues.push({
        severity: 'WARNING',
        code: colorResult.warningCode ?? 'INVALID_COLOR_VALUE',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Màu',
        rawValue: p.rawColor,
        message: colorResult.warningMessage ?? 'Giá trị màu sắc không hợp lệ.',
      });
    } else if (colorResult.warningCode === 'MISSING_COLOR') {
      issues.push({
        severity: 'WARNING',
        code: 'MISSING_COLOR',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Màu',
        rawValue: p.rawColor,
        message: 'Sản phẩm chưa có màu sắc (biến thể sẽ có colorId rỗng).',
      });
    } else if (colorResult.isMultiColor) {
      issues.push({
        severity: 'INFO',
        code: 'MULTI_COLOR_PARSED',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Màu',
        rawValue: p.rawColor,
        message: `Đã tách các màu thành [${colorResult.colors.map((c) => c.name).join(', ')}].`,
      });

      // Check inventory allocation for multi-color
      if (p.quantity !== null && p.quantity > 0 && p.quantity < colorResult.colors.length) {
        issues.push({
          severity: 'REVIEW_REQUIRED',
          code: 'INVENTORY_ALLOCATION_REVIEW_REQUIRED',
          sheet: 'Sản phẩm',
          row: p.sourceRow,
          productCode: p.productCode,
          field: 'Số lượng tổng',
          rawValue: p.quantity,
          message: `Sản phẩm có ${colorResult.colors.length} biến thể màu nhưng chỉ có ${p.quantity} món đồ trong kho. Cần kiểm tra lại việc phân bổ kho.`,
        });
      }
    }

    // 9. Active status
    const activeBool = parseLegacyBoolean(p.rawActive);
    if (activeBool === null) {
      issues.push({
        severity: 'WARNING',
        code: 'UNKNOWN_ACTIVE_STATUS',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Trạng thái hoạt động',
        rawValue: p.rawActive,
        message: `Trạng thái hoạt động không hợp lệ: "${typeof p.rawActive === 'string' ? p.rawActive : String(p.rawActive)}".`,
      });
    }

    // 10. Image URL
    if (!p.imageUrl || !p.imageUrl.startsWith('http')) {
      issues.push({
        severity: 'WARNING',
        code: 'INVALID_IMAGE_URL',
        sheet: 'Sản phẩm',
        row: p.sourceRow,
        productCode: p.productCode,
        field: 'Ảnh vuông URL',
        rawValue: p.imageUrl,
        message: 'Liên kết hình ảnh bị thiếu hoặc không hợp lệ.',
      });
    }
  }

  const fatalCount = issues.filter((i) => i.severity === 'FATAL').length;
  const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;
  const reviewRequiredCount = issues.filter((i) => i.severity === 'REVIEW_REQUIRED').length;

  return {
    isValid: fatalCount === 0 && errorCount === 0,
    fatalCount,
    errorCount,
    warningCount,
    reviewRequiredCount,
    issues,
  };
}
