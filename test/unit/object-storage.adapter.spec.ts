import { S3ObjectStorageAdapter } from '../../src/common/storage/s3-object-storage.adapter';
import { ObjectStorageTimeoutError } from '../../src/common/storage/object-storage.port';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-s3');

type SendOptions = { abortSignal?: AbortSignal };
type SendMock = jest.Mock<Promise<unknown>, [unknown, SendOptions?]>;

function abortedError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Storage operation aborted.');
}

describe('S3ObjectStorageAdapter', () => {
  let adapter: S3ObjectStorageAdapter;
  let mockSend: SendMock;

  const config = {
    endpoint: 'https://test-account.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'test-bucket',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    publicBaseUrl: 'https://assets.test.com',
    operationTimeoutMs: 10000,
    cleanupTimeoutMs: 3000,
    maxAttempts: 2,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn<Promise<unknown>, [unknown, SendOptions?]>();
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    adapter = new S3ObjectStorageAdapter(config);
  });

  afterEach(() => {
    jest.useRealTimers();
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
        maxAttempts: 2,
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

    it('aborts a hanging provider operation at the configured deadline', async () => {
      jest.useFakeTimers();
      let signal: AbortSignal | undefined;
      mockSend.mockImplementation((_command, options) => {
        const providerSignal = options?.abortSignal;
        if (!providerSignal) return Promise.reject(new Error('Expected adapter abort signal.'));
        signal = providerSignal;
        return new Promise((_, reject) => {
          providerSignal.addEventListener('abort', () => reject(abortedError(providerSignal)), {
            once: true,
          });
        });
      });

      const operation = adapter.putObject({
        key: 'shops/main/products/sp001/hang.jpg',
        body: Buffer.from('image'),
        contentType: 'image/jpeg',
      });
      const failure = expect(operation).rejects.toBeInstanceOf(ObjectStorageTimeoutError);
      await jest.advanceTimersByTimeAsync(config.operationTimeoutMs);

      await failure;
      expect(signal?.aborted).toBe(true);
    });
  });

  describe('getObject', () => {
    it('keeps the deadline active while consuming a stalled object body and destroys the stream', async () => {
      jest.useFakeTimers();
      let rejectRead!: (reason?: unknown) => void;
      const destroy = jest.fn((reason?: Error) => rejectRead(reason));
      mockSend.mockResolvedValueOnce({
        Body: {
          transformToByteArray: () =>
            new Promise<Uint8Array>((_resolve, reject) => {
              rejectRead = reject;
            }),
          destroy,
        },
      });

      const operation = adapter.getObject('shops/main/products/sp001/hang.jpg', { timeoutMs: 50 });
      const failure = expect(operation).rejects.toBeInstanceOf(ObjectStorageTimeoutError);
      await jest.advanceTimersByTimeAsync(50);

      await failure;
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('preserves a caller cancellation instead of rewriting it as a timeout', async () => {
      const caller = new AbortController();
      const abort = new Error('caller cancelled');
      abort.name = 'AbortError';
      caller.abort(abort);
      mockSend.mockImplementation((_command, options) =>
        Promise.reject(abortedError(options?.abortSignal ?? caller.signal)),
      );

      await expect(
        adapter.getObject('shops/main/products/sp001/cancel.jpg', { signal: caller.signal }),
      ).rejects.toBe(abort);
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

    it('does not classify a timeout as a missing object', async () => {
      jest.useFakeTimers();
      mockSend.mockImplementation(
        (_command, options) =>
          new Promise((_, reject) => {
            const signal = options?.abortSignal;
            if (!signal) throw new Error('Expected adapter abort signal.');
            signal.addEventListener('abort', () => reject(abortedError(signal)), { once: true });
          }),
      );
      const operation = adapter.headObject('shops/main/products/sp001/hang.jpg', { timeoutMs: 50 });
      const failure = expect(operation).rejects.toBeInstanceOf(ObjectStorageTimeoutError);
      await jest.advanceTimersByTimeAsync(50);
      await failure;
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

    it('uses the shorter cleanup deadline and aborts a hanging delete', async () => {
      jest.useFakeTimers();
      let signal: AbortSignal | undefined;
      mockSend.mockImplementation((_command, options) => {
        const providerSignal = options?.abortSignal;
        if (!providerSignal) return Promise.reject(new Error('Expected adapter abort signal.'));
        signal = providerSignal;
        return new Promise((_, reject) => {
          providerSignal.addEventListener('abort', () => reject(abortedError(providerSignal)), {
            once: true,
          });
        });
      });

      const operation = adapter.deleteObject('shops/main/products/sp001/orphan.jpg', {
        purpose: 'cleanup',
      });
      const failure = expect(operation).rejects.toBeInstanceOf(ObjectStorageTimeoutError);
      await jest.advanceTimersByTimeAsync(config.cleanupTimeoutMs);

      await failure;
      expect(signal?.aborted).toBe(true);
    });
  });

  describe('getPublicUrl', () => {
    it('returns resolved public URL for key', () => {
      const url = adapter.getPublicUrl('shops/main/products/sp001/hash.jpg');
      expect(url).toBe('https://assets.test.com/shops/main/products/sp001/hash.jpg');
    });
  });

  it('keeps evidence in the private bucket through upload, read and deletion', async () => {
    adapter = new S3ObjectStorageAdapter({ ...config, privateBucket: 'private-evidence' });
    const key = 'private/rental-confirmations/shop/order/image.jpg';
    const body = Buffer.from('image');
    mockSend.mockResolvedValueOnce({});
    expect(await adapter.putObject({ key, body, contentType: 'image/jpeg' })).toMatchObject({
      publicUrl: '',
    });
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'private-evidence', CacheControl: 'private, no-store' }),
    );
    mockSend.mockResolvedValueOnce({ Body: { transformToByteArray: () => Promise.resolve(body) } });
    expect(await adapter.getObject(key)).toEqual(body);
    expect(GetObjectCommand).toHaveBeenCalledWith({ Bucket: 'private-evidence', Key: key });
    mockSend.mockResolvedValueOnce({});
    await adapter.deleteObject(key);
    expect(DeleteObjectCommand).toHaveBeenCalledWith({ Bucket: 'private-evidence', Key: key });
    expect(() => adapter.getPublicUrl('/' + key)).toThrow('không có liên kết công khai');
  });

  it('refuses to upload evidence without a separate private bucket', async () => {
    await expect(
      adapter.putObject({
        key: 'private/evidence.jpg',
        body: Buffer.from('image'),
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow('bucket riêng tư');
    expect(mockSend).not.toHaveBeenCalled();
  });
});
