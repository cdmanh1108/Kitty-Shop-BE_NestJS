import * as XLSX from 'xlsx';
import {
  normalizeNullableText,
  normalizeText,
  parseLegacyNumber,
} from './legacy-catalog.normalizer';

export interface LegacyProductRow {
  sourceRow: number;
  productCode: string;
  productName: string;
  productGroup: string;
  classification: string | null;
  size: string | null;
  rawColor: unknown;
  quantity: number | null;
  rentalPrice: number | null;
  depositAmount: number | null;
  imageFileId: string | null;
  imageUrl: string | null;
  imageFileName: string | null;
  searchKeyword: string | null;
  rawActive: unknown;
  note: string | null;
}

export interface LegacyCategoryRow {
  sourceRow: number;
  name: string;
}

export interface LegacySizeRow {
  sourceRow: number;
  name: string;
}

export interface LegacySettings {
  currency: string;
  shopName?: string | null;
  imageRatio?: string | null;
  driveFolderId?: string | null;
  rawSettings: Record<string, string>;
}

export interface ParsedLegacyWorkbook {
  products: LegacyProductRow[];
  categories: LegacyCategoryRow[];
  sizes: LegacySizeRow[];
  settings: LegacySettings;
  headerRows: {
    products: number;
    categories: number;
    settings: number;
  };
}

export class LegacyParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyParserError';
  }
}

/**
 * Finds the 0-indexed row index containing the target keyword.
 */
function findHeaderRowIndex(rows: unknown[][], requiredKeyword: string): number {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;
    for (const cell of row) {
      if (cell && normalizeText(cell).toLowerCase().includes(requiredKeyword.toLowerCase())) {
        return r;
      }
    }
  }
  return -1;
}

/**
 * Parses legacy Excel workbook from file path or buffer.
 */
export function parseLegacyWorkbook(source: string | Buffer): ParsedLegacyWorkbook {
  const workbook =
    typeof source === 'string'
      ? XLSX.readFile(source, { cellDates: true })
      : XLSX.read(source, { type: 'buffer', cellDates: true });

  const requiredSheets = ['Sản phẩm', 'Danh mục', 'Cài đặt'];
  for (const sheetName of requiredSheets) {
    if (!workbook.Sheets[sheetName]) {
      throw new LegacyParserError(`Required sheet "${sheetName}" is missing from workbook`);
    }
  }

  // 1. Parse Danh mục
  const dmSheet = workbook.Sheets['Danh mục']!;
  const dmRows: unknown[][] = XLSX.utils.sheet_to_json(dmSheet, { header: 1 });
  const dmHeaderIdx = findHeaderRowIndex(dmRows, 'Nhóm sản phẩm');
  if (dmHeaderIdx === -1) {
    throw new LegacyParserError('Cannot find header row in sheet "Danh mục"');
  }

  const rawDmHeader = (dmRows[dmHeaderIdx] ?? []).map((h) => normalizeText(h));
  const catColIdx = rawDmHeader.findIndex((h) => h.includes('Nhóm sản phẩm'));
  const sizeColIdx = rawDmHeader.findIndex((h) => h === 'Size');

  const categories: LegacyCategoryRow[] = [];
  const sizes: LegacySizeRow[] = [];
  const seenCatNames = new Set<string>();
  const seenSizeNames = new Set<string>();

  for (let r = dmHeaderIdx + 1; r < dmRows.length; r++) {
    const row = dmRows[r];
    if (!row) continue;

    if (catColIdx !== -1 && row[catColIdx]) {
      const catName = normalizeText(row[catColIdx]);
      if (catName.length > 0 && !seenCatNames.has(catName.toLowerCase())) {
        seenCatNames.add(catName.toLowerCase());
        categories.push({ sourceRow: r + 1, name: catName });
      }
    }

    if (sizeColIdx !== -1 && row[sizeColIdx]) {
      const sizeName = normalizeText(row[sizeColIdx]);
      if (sizeName.length > 0 && !seenSizeNames.has(sizeName.toLowerCase())) {
        seenSizeNames.add(sizeName.toLowerCase());
        sizes.push({ sourceRow: r + 1, name: sizeName });
      }
    }
  }

  // 2. Parse Cài đặt
  const cdSheet = workbook.Sheets['Cài đặt']!;
  const cdRows: unknown[][] = XLSX.utils.sheet_to_json(cdSheet, { header: 1 });
  const cdHeaderIdx = findHeaderRowIndex(cdRows, 'Khóa');
  const rawSettings: Record<string, string> = {};

  if (cdHeaderIdx !== -1) {
    for (let r = cdHeaderIdx + 1; r < cdRows.length; r++) {
      const row = cdRows[r];
      if (!row || !row[0]) continue;
      const key = normalizeText(row[0]);
      const val = row[1] !== undefined && row[1] !== null ? normalizeText(row[1]) : '';
      if (key.length > 0) {
        rawSettings[key] = val;
      }
    }
  }

  const settings: LegacySettings = {
    currency: rawSettings['Tiền tệ'] || 'VND',
    shopName: rawSettings['Tên cửa hàng'] || null,
    imageRatio: rawSettings['Tỷ lệ ảnh sản phẩm'] || null,
    driveFolderId: rawSettings['Drive folder ảnh sản phẩm'] || null,
    rawSettings,
  };

  // 3. Parse Sản phẩm
  const spSheet = workbook.Sheets['Sản phẩm']!;
  const spRows: unknown[][] = XLSX.utils.sheet_to_json(spSheet, { header: 1 });
  const spHeaderIdx = findHeaderRowIndex(spRows, 'Mã sản phẩm');
  if (spHeaderIdx === -1) {
    throw new LegacyParserError('Cannot find header row in sheet "Sản phẩm"');
  }

  const spHeader = (spRows[spHeaderIdx] ?? []).map((h) => normalizeText(h));
  const colMap: Record<string, number> = {};
  spHeader.forEach((h, idx) => {
    if (h) colMap[h] = idx;
  });

  const reqCols = ['Mã sản phẩm', 'Tên sản phẩm', 'Nhóm sản phẩm'];
  for (const rc of reqCols) {
    if (colMap[rc] === undefined) {
      throw new LegacyParserError(`Required column "${rc}" is missing from sheet "Sản phẩm"`);
    }
  }

  const products: LegacyProductRow[] = [];
  for (let r = spHeaderIdx + 1; r < spRows.length; r++) {
    const row = spRows[r];
    if (!row) continue;

    const rawCode = row[colMap['Mã sản phẩm']!];
    const code = normalizeText(rawCode);
    if (!code) continue; // skip blank rows

    products.push({
      sourceRow: r + 1,
      productCode: code,
      productName: normalizeText(row[colMap['Tên sản phẩm']!]),
      productGroup: normalizeText(row[colMap['Nhóm sản phẩm']!]),
      classification:
        colMap['Phân loại'] !== undefined
          ? normalizeNullableText(row[colMap['Phân loại']])
          : null,
      size: colMap['Size'] !== undefined ? normalizeNullableText(row[colMap['Size']]) : null,
      rawColor: colMap['Màu'] !== undefined ? row[colMap['Màu']] : undefined,
      quantity:
        colMap['Số lượng tổng'] !== undefined
          ? parseLegacyNumber(row[colMap['Số lượng tổng']])
          : null,
      rentalPrice:
        colMap['Giá thuê mặc định'] !== undefined
          ? parseLegacyNumber(row[colMap['Giá thuê mặc định']])
          : null,
      depositAmount:
        colMap['Tiền cọc mặc định'] !== undefined
          ? parseLegacyNumber(row[colMap['Tiền cọc mặc định']])
          : null,
      imageFileId:
        colMap['Ảnh vuông File ID'] !== undefined
          ? normalizeNullableText(row[colMap['Ảnh vuông File ID']])
          : null,
      imageUrl:
        colMap['Ảnh vuông URL'] !== undefined
          ? normalizeNullableText(row[colMap['Ảnh vuông URL']])
          : null,
      imageFileName:
        colMap['Ảnh vuông Tên file'] !== undefined
          ? normalizeNullableText(row[colMap['Ảnh vuông Tên file']])
          : null,
      searchKeyword:
        colMap['Từ khóa tìm nhanh'] !== undefined
          ? normalizeNullableText(row[colMap['Từ khóa tìm nhanh']])
          : null,
      rawActive:
        colMap['Trạng thái hoạt động'] !== undefined
          ? row[colMap['Trạng thái hoạt động']]
          : undefined,
      note: colMap['Ghi chú'] !== undefined ? normalizeNullableText(row[colMap['Ghi chú']]) : null,
    });
  }

  return {
    products,
    categories,
    sizes,
    settings,
    headerRows: {
      products: spHeaderIdx + 1,
      categories: dmHeaderIdx + 1,
      settings: cdHeaderIdx + 1,
    },
  };
}
