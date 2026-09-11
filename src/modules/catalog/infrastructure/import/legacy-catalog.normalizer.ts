/**
 * Pure normalization utilities for legacy catalog workbook cells.
 */

/**
 * Remove Vietnamese diacritics and normalize to ASCII alphanumeric uppercase code.
 */
export function normalizeToCode(text: string): string {
  if (!text) return '';

  const withoutDiacritics = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (match) => (match === 'đ' ? 'd' : 'D'));

  return withoutDiacritics
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Normalize cell string: trims whitespace and applies Unicode NFC.
 */
export function normalizeText(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.normalize('NFC').trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim();
  return '';
}

/**
 * Returns trimmed string or null if empty.
 */
export function normalizeNullableText(val: unknown): string | null {
  const normalized = normalizeText(val);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Parse money or integer number from cell (handling numbers, strings with commas or dots).
 */
export function parseLegacyNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val !== 'string') return null;
  const str = val.trim();
  if (str.length === 0) return null;

  // Remove standard formatting (thousands separators)
  const cleaned = str.replace(/[,. ]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Normalizes legacy active status:
 * 'Có' / 'Co' / 'yes' / 'true' -> true
 * 'Ngưng' / 'Ngung' / 'no' / 'false' -> false
 */
export function parseLegacyBoolean(val: unknown): boolean | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;

  const text = normalizeText(val);
  const normalized = normalizeToCode(text);
  if (normalized === 'CO' || normalized === 'YES' || normalized === 'TRUE' || normalized === '1') {
    return true;
  }
  if (
    normalized === 'NGUNG' ||
    normalized === 'KHONG' ||
    normalized === 'NO' ||
    normalized === 'FALSE' ||
    normalized === '0'
  ) {
    return false;
  }

  return null;
}
