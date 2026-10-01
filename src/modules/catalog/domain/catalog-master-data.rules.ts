import { CATALOG_ERROR_CODE, CatalogColorError, CatalogSizeError } from './catalog-errors';

const MASTER_DATA_CODE_PATTERN = /^[A-Z0-9_]+$/;
const MASTER_DATA_CODE_MAX_LENGTH = 50;
const MASTER_DATA_NAME_MAX_LENGTH = 100;

function normalizeCode(value: string, entity: 'color' | 'size'): string {
  const code = value.trim().toUpperCase();
  if (
    code.length === 0 ||
    code.length > MASTER_DATA_CODE_MAX_LENGTH ||
    !MASTER_DATA_CODE_PATTERN.test(code)
  ) {
    throw entity === 'color'
      ? new CatalogColorError(CATALOG_ERROR_CODE.COLOR_CODE_INVALID)
      : new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_CODE_INVALID);
  }
  return code;
}

function normalizeName(value: string, entity: 'color' | 'size'): string {
  const name = value.trim();
  const nameLength = Array.from(name).length;
  if (nameLength === 0 || nameLength > MASTER_DATA_NAME_MAX_LENGTH) {
    throw entity === 'color'
      ? new CatalogColorError(CATALOG_ERROR_CODE.COLOR_NAME_INVALID)
      : new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_NAME_INVALID);
  }
  return name;
}

export function normalizeColorCode(value: string): string {
  return normalizeCode(value, 'color');
}

export function normalizeSizeCode(value: string): string {
  return normalizeCode(value, 'size');
}

export function normalizeColorName(value: string): string {
  return normalizeName(value, 'color');
}

export function normalizeSizeName(value: string): string {
  return normalizeName(value, 'size');
}

export function normalizeHexColor(value: string | null | undefined): string | null {
  if (value == null) return null;
  const hexColor = value.trim();
  if (hexColor.length === 0) return null;
  if (!/^#[\da-fA-F]{6}$/.test(hexColor)) {
    throw new CatalogColorError(CATALOG_ERROR_CODE.COLOR_HEX_INVALID);
  }
  return hexColor.toUpperCase();
}

export function normalizeSizeSortOrder(value: number | undefined): number {
  const sortOrder = value === undefined ? 0 : value;
  if (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new CatalogSizeError(CATALOG_ERROR_CODE.SIZE_SORT_ORDER_INVALID);
  }
  return sortOrder;
}
