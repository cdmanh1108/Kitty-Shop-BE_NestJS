import { createHash } from 'node:crypto';

export interface ValidatedImageInfo {
  mimeType: string;
  extension: string;
  contentHash: string;
  sizeBytes: number;
}

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export const MAX_MEDIA_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB safe limit

/**
 * Validates image buffer magic bytes and returns recognized MIME type and extension.
 * Rejects HTML, empty files, or unknown/corrupt formats.
 */
export function detectImageFormat(buffer: Buffer): { mimeType: string; extension: string } {
  if (!buffer || buffer.length === 0) {
    throw new Error('Image buffer is empty');
  }
  if (buffer.length > MAX_MEDIA_FILE_SIZE_BYTES) {
    throw new Error(`Image exceeds maximum allowed size of ${MAX_MEDIA_FILE_SIZE_BYTES} bytes`);
  }

  // Check magic bytes
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // GIF: GIF87a or GIF89a (47 49 46 38)
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return { mimeType: 'image/gif', extension: 'gif' };
  }

  // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  // Check if buffer starts with HTML tags or XML
  const preview = buffer.subarray(0, Math.min(buffer.length, 100)).toString('utf8').trim().toLowerCase();
  if (preview.startsWith('<!doctype html') || preview.startsWith('<html') || preview.startsWith('<?xml')) {
    throw new Error('Downloaded content is HTML/XML text, not a valid image file');
  }

  throw new Error('Unsupported or unrecognizable image format (magic bytes check failed)');
}

/**
 * Computes SHA-256 hash over raw image bytes.
 */
export function computeContentHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Inspects and validates raw image buffer, returning validated MIME, extension, hash, and size.
 */
export function validateAndHashImage(buffer: Buffer, declaredContentType?: string): ValidatedImageInfo {
  const detected = detectImageFormat(buffer);

  // If declared Content-Type is provided, verify it's an image
  if (declaredContentType) {
    const cleanDeclared = declaredContentType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (cleanDeclared.startsWith('text/') || cleanDeclared.includes('html')) {
      throw new Error(`Declared content type "${declaredContentType}" is not an image`);
    }
    // If declared matches an extension in our map and detected is compatible, prefer standard mapping
    if (cleanDeclared in MIME_TO_EXTENSION && cleanDeclared === detected.mimeType) {
      detected.extension = MIME_TO_EXTENSION[cleanDeclared]!;
    }
  }

  const contentHash = computeContentHash(buffer);
  return {
    mimeType: detected.mimeType,
    extension: detected.extension,
    contentHash,
    sizeBytes: buffer.length,
  };
}

/**
 * Sanitizes identifier parts for safe S3 key paths.
 */
function sanitizeKeyIdentifier(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase();
}

/**
 * Builds canonical, content-addressed, provider-neutral S3 storage key.
 * Format: shops/<shop-code>/products/<product-code>/<sha256>.<extension>
 */
export function buildProductMediaKey(params: {
  shopCode: string;
  productCode: string;
  contentHash: string;
  extension: string;
}): string {
  const shopPart = sanitizeKeyIdentifier(params.shopCode || 'main');
  const productPart = sanitizeKeyIdentifier(params.productCode);
  const extPart = params.extension.replace(/^\.+/, '').toLowerCase();
  return `shops/${shopPart}/products/${productPart}/${params.contentHash}.${extPart}`;
}
