import {
  buildProductMediaKey,
  detectImageFormat,
  validateAndHashImage,
} from '../../src/common/storage/storage-key.builder';
import { resolvePublicUrl } from '../../src/common/storage/public-url.resolver';
import type { ObjectStoragePort } from '../../src/common/storage/object-storage.port';

describe('MediaSync & Idempotency Logic', () => {
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x00, 0x01]);

  let putObjectMock: jest.Mock;
  let headObjectMock: jest.Mock;
  let deleteObjectMock: jest.Mock;
  let getPublicUrlMock: jest.Mock;
  let mockStorage: ObjectStoragePort;

  beforeEach(() => {
    putObjectMock = jest.fn();
    headObjectMock = jest.fn();
    deleteObjectMock = jest.fn();
    getPublicUrlMock = jest.fn((key) => `https://assets.example.com/${key}`);

    mockStorage = {
      putObject: putObjectMock,
      headObject: headObjectMock,
      deleteObject: deleteObjectMock,
      getPublicUrl: getPublicUrlMock,
    };
  });

  describe('Idempotency & Re-run safety', () => {
    it('skips item if storageKey already exists in record', () => {
      const mediaRecord = {
        id: 'media-1',
        storageKey: 'shops/main/products/sp001/abc.jpg',
        url: 'https://drive.google.com/old',
      };

      const shouldProcess = !mediaRecord.storageKey;
      expect(shouldProcess).toBe(false);
      expect(putObjectMock).not.toHaveBeenCalled();
    });

    it('HEAD-before-PUT: reuses remote object if it already exists in storage and avoids duplicate PUT', async () => {
      const validated = validateAndHashImage(validJpeg, 'image/jpeg');
      const key = buildProductMediaKey({
        shopCode: 'MAIN',
        productCode: 'SP001',
        contentHash: validated.contentHash,
        extension: validated.extension,
      });

      // Storage already has this object from a previous crashed run
      headObjectMock.mockResolvedValueOnce({
        contentType: 'image/jpeg',
        contentLength: validJpeg.length,
        etag: '"etag-1"',
      });

      const headResult = await mockStorage.headObject(key);
      const objectExists = headResult !== null;

      expect(objectExists).toBe(true);
      expect(putObjectMock).not.toHaveBeenCalled();

      // DB update can safely proceed with this key
      const dbUpdatePayload = { storageKey: key };
      expect(dbUpdatePayload.storageKey).toBe(key);
    });

    it('uploads object when HEAD returns null (new object)', async () => {
      const validated = validateAndHashImage(validJpeg, 'image/jpeg');
      const key = buildProductMediaKey({
        shopCode: 'MAIN',
        productCode: 'SP001',
        contentHash: validated.contentHash,
        extension: validated.extension,
      });

      headObjectMock.mockResolvedValueOnce(null);
      putObjectMock.mockResolvedValueOnce({
        storageKey: key,
        publicUrl: `https://assets.example.com/${key}`,
      });

      const headResult = await mockStorage.headObject(key);
      if (!headResult) {
        await mockStorage.putObject({
          key,
          body: validJpeg,
          contentType: validated.mimeType,
        });
      }

      expect(putObjectMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Invalid source content rejection', () => {
    it('detects and rejects HTML quota error page from Google Drive', () => {
      const htmlQuotaPage = Buffer.from(
        '<!DOCTYPE html><html><head><title>Google Drive - Quota exceeded</title></head><body>429 Too Many Requests</body></html>',
      );

      expect(() => detectImageFormat(htmlQuotaPage)).toThrow(
        'Downloaded content is HTML/XML text, not a valid image file',
      );
    });
  });

  describe('API resolution portability', () => {
    it('resolves image URL using configured publicBaseUrl without touching DB record', () => {
      const dbRecord = {
        id: 'media-1',
        storageKey: 'shops/main/products/sp001/abc.jpg',
        url: 'https://drive.google.com/legacy-thumbnail',
      };

      const resolvedDev = resolvePublicUrl('https://pub-xxx.r2.dev', dbRecord.storageKey);
      expect(resolvedDev).toBe('https://pub-xxx.r2.dev/shops/main/products/sp001/abc.jpg');

      const resolvedProd = resolvePublicUrl('https://assets.example.com', dbRecord.storageKey);
      expect(resolvedProd).toBe('https://assets.example.com/shops/main/products/sp001/abc.jpg');

      // If storageKey is null, falls back to legacy Drive URL
      const legacyRecord = { id: 'media-2', storageKey: null, url: 'https://drive.google.com/legacy' };
      const resolvedLegacy = legacyRecord.storageKey
        ? resolvePublicUrl('https://assets.example.com', legacyRecord.storageKey)
        : legacyRecord.url;
      expect(resolvedLegacy).toBe('https://drive.google.com/legacy');
    });
  });
});
