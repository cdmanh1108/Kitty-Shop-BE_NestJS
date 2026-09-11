import {
  buildProductMediaKey,
  computeContentHash,
  detectImageFormat,
  validateAndHashImage,
  MAX_MEDIA_FILE_SIZE_BYTES,
} from '../../src/common/storage/storage-key.builder';

describe('StorageKeyBuilder & ImageValidator', () => {
  // Sample valid JPEG buffer (FF D8 FF E0 00 10 4A 46)
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x00, 0x01]);
  // Sample valid PNG buffer (89 50 4E 47 0D 0A 1A 0A)
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  // Sample valid WEBP buffer (RIFF....WEBP)
  const webpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);

  describe('detectImageFormat', () => {
    it('detects JPEG format correctly', () => {
      const result = detectImageFormat(jpegBuffer);
      expect(result).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    });

    it('detects PNG format correctly', () => {
      const result = detectImageFormat(pngBuffer);
      expect(result).toEqual({ mimeType: 'image/png', extension: 'png' });
    });

    it('detects WEBP format correctly', () => {
      const result = detectImageFormat(webpBuffer);
      expect(result).toEqual({ mimeType: 'image/webp', extension: 'webp' });
    });

    it('throws error for empty buffer', () => {
      expect(() => detectImageFormat(Buffer.alloc(0))).toThrow('Image buffer is empty');
    });

    it('rejects HTML masquerading as image', () => {
      const htmlBuffer = Buffer.from('<!DOCTYPE html><html><body>Error 429 Quota Exceeded</body></html>');
      expect(() => detectImageFormat(htmlBuffer)).toThrow('Downloaded content is HTML/XML text');
    });

    it('rejects random binary data without valid image magic bytes', () => {
      const randomBuffer = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
      expect(() => detectImageFormat(randomBuffer)).toThrow('Unsupported or unrecognizable image format');
    });

    it('rejects oversized buffer', () => {
      const hugeBuffer = Buffer.alloc(MAX_MEDIA_FILE_SIZE_BYTES + 10);
      expect(() => detectImageFormat(hugeBuffer)).toThrow(/exceeds maximum allowed size/);
    });
  });

  describe('computeContentHash', () => {
    it('computes deterministic SHA-256 hash over bytes', () => {
      const hash1 = computeContentHash(jpegBuffer);
      const hash2 = computeContentHash(jpegBuffer);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('produces different hash for different bytes', () => {
      const hash1 = computeContentHash(jpegBuffer);
      const hash2 = computeContentHash(pngBuffer);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateAndHashImage', () => {
    it('validates JPEG and extracts hash and extension', () => {
      const result = validateAndHashImage(jpegBuffer, 'image/jpeg');
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.extension).toBe('jpg');
      expect(result.contentHash).toHaveLength(64);
      expect(result.sizeBytes).toBe(jpegBuffer.length);
    });

    it('rejects if declared content type is HTML', () => {
      expect(() => validateAndHashImage(jpegBuffer, 'text/html')).toThrow(
        'Declared content type "text/html" is not an image',
      );
    });
  });

  describe('buildProductMediaKey', () => {
    it('builds canonical provider-neutral key with content hash', () => {
      const key = buildProductMediaKey({
        shopCode: 'MAIN',
        productCode: 'SP001',
        contentHash: '51f207f74abc123',
        extension: 'jpg',
      });
      expect(key).toBe('shops/main/products/sp001/51f207f74abc123.jpg');
    });

    it('never contains bucket name, provider name, or domain in key', () => {
      const key = buildProductMediaKey({
        shopCode: 'MAIN',
        productCode: 'SP001',
        contentHash: '51f207f74abc123',
        extension: 'jpg',
      });
      expect(key).not.toContain('r2');
      expect(key).not.toContain('s3');
      expect(key).not.toContain('http');
      expect(key).not.toContain('bucket');
    });

    it('sanitizes special characters in product and shop codes', () => {
      const key = buildProductMediaKey({
        shopCode: 'Shop #1',
        productCode: 'SP 001/Test',
        contentHash: 'hash123',
        extension: '.PNG',
      });
      expect(key).toBe('shops/shop__1/products/sp_001_test/hash123.png');
    });
  });
});
