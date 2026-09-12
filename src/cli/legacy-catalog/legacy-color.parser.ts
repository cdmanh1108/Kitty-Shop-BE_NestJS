import { normalizeText, normalizeToCode } from './legacy-catalog.normalizer';

export interface LegacyColor {
  code: string;
  name: string;
}

export interface LegacyColorParseResult {
  valid: boolean;
  colors: LegacyColor[];
  isMultiColor: boolean;
  raw: unknown;
  warningCode?: 'INVALID_COLOR_VALUE' | 'UNRESOLVED_COLOR_VALUE' | 'MISSING_COLOR';
  warningMessage?: string;
}

/**
 * Known Vietnamese color vocabulary.
 * Ordered by word count and length descending so multi-word colors match before single-word tokens.
 */
const CANONICAL_COLORS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  // 3-word colors
  { name: 'Xanh dương nhạt', pattern: /^xanh\s+dương\s+nhạt/i },
  { name: 'Xanh lá nhạt', pattern: /^xanh\s+lá\s+nhạt/i },

  // 2-word colors
  { name: 'Vàng chanh', pattern: /^vàng\s+chanh/i },
  { name: 'Vàng nhạt', pattern: /^vàng\s+nhạt/i },
  { name: 'Xanh dương', pattern: /^xanh\s+dương/i },
  { name: 'Xanh lá', pattern: /^xanh\s+lá/i },
  { name: 'Xanh nhạt', pattern: /^xanh\s+nhạt/i },
  { name: 'Loang màu', pattern: /^loang\s+màu/i },
  { name: 'Hồng phấn', pattern: /^hồng\s+phấn/i },
  { name: 'Trắng kem', pattern: /^trắng\s+kem/i },

  // 1-word colors
  { name: 'Trắng', pattern: /^trắng/i },
  { name: 'Hồng', pattern: /^hồng/i },
  { name: 'Vàng', pattern: /^vàng/i },
  { name: 'Xanh', pattern: /^xanh/i },
  { name: 'Xám', pattern: /^xám/i },
  { name: 'Nâu', pattern: /^nâu/i },
  { name: 'Kem', pattern: /^kem/i },
  { name: 'Đen', pattern: /^đen/i },
  { name: 'Đỏ', pattern: /^đỏ/i },
  { name: 'Tím', pattern: /^tím/i },
];

/**
 * Parses legacy color raw cell into structured, deduplicated LegacyColor items.
 * Does NOT blindly raw.split(' ').
 * Rejects numeric values as invalid.
 * Handles blanks as missing (nullable colorId).
 */
export function parseLegacyColors(raw: unknown): LegacyColorParseResult {
  if (raw === null || raw === undefined) {
    return {
      valid: true,
      colors: [],
      isMultiColor: false,
      raw,
      warningCode: 'MISSING_COLOR',
      warningMessage: 'Color field is empty',
    };
  }

  // Check numeric types or purely numeric strings (e.g. SP040 has Color = 1)
  if (typeof raw === 'number' || (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw))) {
    return {
      valid: false,
      colors: [],
      isMultiColor: false,
      raw,
      warningCode: 'INVALID_COLOR_VALUE',
      warningMessage: `Invalid numeric color value: ${raw}`,
    };
  }

  const text = normalizeText(raw);
  if (text.length === 0) {
    return {
      valid: true,
      colors: [],
      isMultiColor: false,
      raw,
      warningCode: 'MISSING_COLOR',
      warningMessage: 'Color field is empty',
    };
  }

  // Split by explicit delimiters: comma, slash, plus, semicolon
  const chunks = text
    .split(/[,/\\+;]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const matchedColors: LegacyColor[] = [];
  let hasUnresolved = false;

  for (const chunk of chunks) {
    let remaining = chunk;
    let matchedInChunk = false;

    while (remaining.length > 0) {
      remaining = remaining.trim();
      if (remaining.length === 0) break;

      let matched = false;
      for (const entry of CANONICAL_COLORS) {
        const match = remaining.match(entry.pattern);
        if (match && match[0]) {
          matchedColors.push({
            name: entry.name,
            code: normalizeToCode(entry.name),
          });
          remaining = remaining.slice(match[0].length);
          matched = true;
          matchedInChunk = true;
          break;
        }
      }

      if (!matched) {
        // Look ahead to check if the next word is unrecognized
        hasUnresolved = true;
        break;
      }
    }

    if (!matchedInChunk) {
      hasUnresolved = true;
    }
  }

  // Deduplicate matched colors by code while preserving order
  const uniqueColors: LegacyColor[] = [];
  const seenCodes = new Set<string>();
  for (const c of matchedColors) {
    if (!seenCodes.has(c.code)) {
      seenCodes.add(c.code);
      uniqueColors.push(c);
    }
  }

  if (hasUnresolved && uniqueColors.length === 0) {
    return {
      valid: false,
      colors: [],
      isMultiColor: false,
      raw,
      warningCode: 'UNRESOLVED_COLOR_VALUE',
      warningMessage: `Unresolved color token in value: "${text}"`,
    };
  }

  return {
    valid: true,
    colors: uniqueColors,
    isMultiColor: uniqueColors.length > 1,
    raw,
    ...(hasUnresolved
      ? {
          warningCode: 'UNRESOLVED_COLOR_VALUE',
          warningMessage: `Partially unresolved color in value: "${text}"`,
        }
      : {}),
  };
}
