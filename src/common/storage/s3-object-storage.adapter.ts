import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type {
  ObjectStoragePort,
  PutObjectInput,
  StoredObject,
  StoredObjectMetadata,
} from './object-storage.port';
import { resolvePublicUrl } from './public-url.resolver';

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: S3StorageConfig) {
    if (!config.bucket || config.bucket.trim() === '') {
      throw new Error('Tên vùng lưu trữ S3 không được để trống.');
    }
    this.bucket = config.bucket.trim();
    this.publicBaseUrl = config.publicBaseUrl ?? '';

    this.client = new S3Client({
      endpoint:
        config.endpoint && config.endpoint.trim() !== '' ? config.endpoint.trim() : undefined,
      region: config.region && config.region.trim() !== '' ? config.region.trim() : 'auto',
      credentials: {
        accessKeyId: config.accessKeyId ?? '',
        secretAccessKey: config.secretAccessKey ?? '',
      },
      forcePathStyle: true,
    });
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const cleanKey = input.key.trim().replace(/^\/+/, '');
    const cacheControl = input.cacheControl ?? 'public, max-age=31536000, immutable';

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: cacheControl,
      }),
    );

    return {
      storageKey: cleanKey,
      publicUrl: this.getPublicUrl(cleanKey),
      contentType: input.contentType,
      contentLength: input.body.length,
    };
  }

  async headObject(key: string): Promise<StoredObjectMetadata | null> {
    const cleanKey = key.trim().replace(/^\/+/, '');
    try {
      const res = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey,
        }),
      );
      return {
        contentType: res.ContentType,
        contentLength: res.ContentLength,
        etag: res.ETag,
        lastModified: res.LastModified,
      };
    } catch (err: unknown) {
      const errorObj = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        errorObj.name === 'NotFound' ||
        errorObj.name === 'NoSuchKey' ||
        errorObj.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const cleanKey = key.trim().replace(/^\/+/, '');
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      }),
    );
  }

  getPublicUrl(key: string): string {
    return resolvePublicUrl(this.publicBaseUrl, key);
  }
}
