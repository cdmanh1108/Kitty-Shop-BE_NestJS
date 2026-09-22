import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type {
  ObjectStorageOperationOptions,
  ObjectStoragePort,
  PutObjectInput,
  StoredObject,
  StoredObjectMetadata,
} from './object-storage.port';
import { ObjectStorageTimeoutError } from './object-storage.port';
import { resolvePublicUrl } from './public-url.resolver';

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  privateBucket?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  operationTimeoutMs: number;
  cleanupTimeoutMs: number;
  maxAttempts: number;
}

type ReadableObjectBody = {
  transformToByteArray(): Promise<Uint8Array>;
  destroy?(error?: Error): void;
  cancel?(reason?: unknown): Promise<void>;
};

interface OperationContext {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose(): void;
}

export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly privateBucket: string;
  private readonly publicBaseUrl: string;
  private readonly operationTimeoutMs: number;
  private readonly cleanupTimeoutMs: number;

  constructor(config: S3StorageConfig) {
    if (!config.bucket || config.bucket.trim() === '') {
      throw new Error('Tên vùng lưu trữ S3 không được để trống.');
    }
    this.bucket = config.bucket.trim();
    this.privateBucket = config.privateBucket?.trim() ?? '';
    this.publicBaseUrl = config.publicBaseUrl ?? '';
    this.operationTimeoutMs = config.operationTimeoutMs;
    this.cleanupTimeoutMs = config.cleanupTimeoutMs;

    this.client = new S3Client({
      endpoint:
        config.endpoint && config.endpoint.trim() !== '' ? config.endpoint.trim() : undefined,
      region: config.region && config.region.trim() !== '' ? config.region.trim() : 'auto',
      credentials: {
        accessKeyId: config.accessKeyId ?? '',
        secretAccessKey: config.secretAccessKey ?? '',
      },
      forcePathStyle: true,
      maxAttempts: config.maxAttempts,
    });
  }

  async putObject(
    input: PutObjectInput,
    options?: ObjectStorageOperationOptions,
  ): Promise<StoredObject> {
    const cleanKey = input.key.trim().replace(/^\/+/, '');
    const cacheControl = cleanKey.startsWith('private/')
      ? 'private, no-store'
      : (input.cacheControl ?? 'public, max-age=31536000, immutable');

    await this.withDeadline(options, (signal) =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketFor(cleanKey),
          Key: cleanKey,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: cacheControl,
        }),
        { abortSignal: signal },
      ),
    );

    return {
      storageKey: cleanKey,
      publicUrl: cleanKey.startsWith('private/') ? '' : this.getPublicUrl(cleanKey),
      contentType: input.contentType,
      contentLength: input.body.length,
    };
  }

  async getObject(key: string, options?: ObjectStorageOperationOptions): Promise<Uint8Array> {
    return this.withDeadline(options, async (signal) => {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key }),
        { abortSignal: signal },
      );
      if (!result.Body) throw new Error('Không tìm thấy nội dung tệp.');
      return this.readBody(result.Body as ReadableObjectBody, signal);
    });
  }

  async headObject(
    key: string,
    options?: ObjectStorageOperationOptions,
  ): Promise<StoredObjectMetadata | null> {
    const cleanKey = key.trim().replace(/^\/+/, '');
    try {
      const res = await this.withDeadline(options, (signal) =>
        this.client.send(
          new HeadObjectCommand({
            Bucket: this.bucketFor(cleanKey),
            Key: cleanKey,
          }),
          { abortSignal: signal },
        ),
      );
      return {
        contentType: res.ContentType,
        contentLength: res.ContentLength,
        etag: res.ETag,
        lastModified: res.LastModified,
      };
    } catch (err: unknown) {
      if (this.isNotFound(err)) return null;
      throw err;
    }
  }

  async deleteObject(key: string, options?: ObjectStorageOperationOptions): Promise<void> {
    const cleanKey = key.trim().replace(/^\/+/, '');
    await this.withDeadline(options, (signal) =>
      this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketFor(cleanKey),
          Key: cleanKey,
        }),
        { abortSignal: signal },
      ),
    );
  }

  getPublicUrl(key: string): string {
    if (key.trim().replace(/^\/+/, '').startsWith('private/'))
      throw new Error('Tệp riêng tư không có liên kết công khai.');
    return resolvePublicUrl(this.publicBaseUrl, key);
  }

  private async withDeadline<T>(
    options: ObjectStorageOperationOptions | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const timeoutMs =
      options?.timeoutMs ??
      (options?.purpose === 'cleanup' ? this.cleanupTimeoutMs : this.operationTimeoutMs);
    const context = this.createOperationContext(timeoutMs, options?.signal);
    try {
      return await operation(context.signal);
    } catch (error) {
      if (context.timedOut()) throw new ObjectStorageTimeoutError(timeoutMs);
      throw error;
    } finally {
      context.dispose();
    }
  }

  private createOperationContext(timeoutMs: number, callerSignal?: AbortSignal): OperationContext {
    const controller = new AbortController();
    let didTimeout = false;
    const abortForTimeout = () => {
      didTimeout = true;
      controller.abort(new ObjectStorageTimeoutError(timeoutMs));
    };
    const abortForCaller = () => controller.abort(callerSignal?.reason);

    if (callerSignal?.aborted) abortForCaller();
    else callerSignal?.addEventListener('abort', abortForCaller, { once: true });
    const timeoutId = setTimeout(abortForTimeout, timeoutMs);

    return {
      signal: controller.signal,
      timedOut: () => didTimeout,
      dispose: () => {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', abortForCaller);
      },
    };
  }

  private async readBody(body: ReadableObjectBody, signal: AbortSignal): Promise<Uint8Array> {
    const cancelBody = () => {
      const reason = signal.reason instanceof Error ? signal.reason : undefined;
      if (body.destroy) body.destroy(reason);
      else if (body.cancel) void body.cancel(signal.reason);
    };
    if (signal.aborted) {
      cancelBody();
      throw signal.reason;
    }
    signal.addEventListener('abort', cancelBody, { once: true });
    try {
      return await body.transformToByteArray();
    } finally {
      signal.removeEventListener('abort', cancelBody);
    }
  }

  private isNotFound(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const error = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
    return (
      error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata?.httpStatusCode === 404
    );
  }

  private bucketFor(key: string): string {
    if (!key.startsWith('private/')) return this.bucket;
    if (!this.privateBucket || this.privateBucket === this.bucket)
      throw new Error('Chưa cấu hình bucket riêng tư cho ảnh bằng chứng.');
    return this.privateBucket;
  }
}
