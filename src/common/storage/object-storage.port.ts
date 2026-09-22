export interface StoredObjectMetadata {
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

export interface StoredObject {
  storageKey: string;
  publicUrl: string;
  contentType?: string;
  contentLength?: number;
}

export interface PutObjectInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
}

/**
 * Provider-neutral operation controls. A caller-owned signal is never aborted
 * by the adapter; adapter timeouts are composed with it internally.
 */
export interface ObjectStorageOperationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  purpose?: 'default' | 'cleanup';
}

export class ObjectStorageTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Thao tác kho lưu trữ vượt quá thời gian chờ ${timeoutMs}ms.`);
    this.name = 'ObjectStorageTimeoutError';
  }
}

export interface ObjectStoragePort {
  getObject(key: string, options?: ObjectStorageOperationOptions): Promise<Uint8Array>;
  putObject(input: PutObjectInput, options?: ObjectStorageOperationOptions): Promise<StoredObject>;
  headObject(
    key: string,
    options?: ObjectStorageOperationOptions,
  ): Promise<StoredObjectMetadata | null>;
  deleteObject(key: string, options?: ObjectStorageOperationOptions): Promise<void>;
  getPublicUrl(key: string): string;
}

export const OBJECT_STORAGE_PORT = Symbol('OBJECT_STORAGE_PORT');
