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

export interface ObjectStoragePort {
  getObject(key: string): Promise<Uint8Array>;
  putObject(input: PutObjectInput): Promise<StoredObject>;
  headObject(key: string): Promise<StoredObjectMetadata | null>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

export const OBJECT_STORAGE_PORT = Symbol('OBJECT_STORAGE_PORT');
