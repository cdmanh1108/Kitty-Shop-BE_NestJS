import { S3ObjectStorageAdapter } from '../../src/common/storage/s3-object-storage.adapter';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-s3');

describe('S3ObjectStorageAdapter', () => {
  let adapter: S3ObjectStorageAdapter;
  let mockSend: jest.Mock;

  const config = {
    endpoint: 'https://test-account.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'test-bucket',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    publicBaseUrl: 'https://assets.test.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn();
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    adapter = new S3ObjectStorageAdapter(config);
  });

  describe('constructor', () => {
    it('throws error if bucket is empty', () => {
      expect(
        () =>
          new S3ObjectStorageAdapter({
            ...config,
            bucket: '   ',
          }),
      ).toThrow('Tên vùng lưu trữ S3 không được để trống.');
    });

    it('instantiates S3Client with forcePathStyle and provider-neutral config', () => {
      expect(S3Client).toHaveBeenCalledWith({
        endpoint: config.endpoint,
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: true,
      });
    });
  });

  describe('putObject', () => {
    it('sends PutObjectCommand with correct parameters and cache-control', async () => {
      mockSend.mockResolvedValueOnce({});
      const body = Buffer.from('image-bytes');

      const result = await adapter.putObject({
        key: 'shops/main/products/sp001/hash.jpg',
        body,
        contentType: 'image/jpeg',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'shops/main/products/sp001/hash.jpg',
        Body: body,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      });

      expect(result).toEqual({
        storageKey: 'shops/main/products/sp001/hash.jpg',
        publicUrl: 'https://assets.test.com/shops/main/products/sp001/hash.jpg',
        contentType: 'image/jpeg',
        contentLength: body.length,
      });
    });
  });

  describe('headObject', () => {
    it('returns metadata when object is found', async () => {
      mockSend.mockResolvedValueOnce({
        ContentType: 'image/jpeg',
        ContentLength: 1024,
        ETag: '"etag-123"',
        LastModified: new Date('2026-09-11T00:00:00Z'),
      });

      const meta = await adapter.headObject('shops/main/products/sp001/hash.jpg');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'shops/main/products/sp001/hash.jpg',
      });

      expect(meta).toEqual({
        contentType: 'image/jpeg',
        contentLength: 1024,
        etag: '"etag-123"',
        lastModified: new Date('2026-09-11T00:00:00Z'),
      });
    });

    it('returns null when object is not found (NotFound or NoSuchKey)', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValueOnce(notFoundError);

      const meta = await adapter.headObject('shops/main/products/sp001/missing.jpg');
      expect(meta).toBeNull();
    });

    it('returns null when httpStatusCode is 404', async () => {
      const error404 = Object.assign(new Error('404'), {
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValueOnce(error404);

      const meta = await adapter.headObject('shops/main/products/sp001/missing.jpg');
      expect(meta).toBeNull();
    });

    it('rethrows unexpected storage errors without leaking secrets', async () => {
      const fatalError = new Error('Connection refused');
      mockSend.mockRejectedValueOnce(fatalError);

      await expect(adapter.headObject('key')).rejects.toThrow('Connection refused');
    });
  });

  describe('deleteObject', () => {
    it('sends DeleteObjectCommand with correct key', async () => {
      mockSend.mockResolvedValueOnce({});

      await adapter.deleteObject('shops/main/products/sp001/old.jpg');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'shops/main/products/sp001/old.jpg',
      });
    });
  });

  describe('getPublicUrl', () => {
    it('returns resolved public URL for key', () => {
      const url = adapter.getPublicUrl('shops/main/products/sp001/hash.jpg');
      expect(url).toBe('https://assets.test.com/shops/main/products/sp001/hash.jpg');
    });
  });
});
