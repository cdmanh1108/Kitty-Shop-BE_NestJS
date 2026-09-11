import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestMetadata {
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

// One context per asynchronous request chain; never stores tenant, actor or services.
const storage = new AsyncLocalStorage<Readonly<RequestMetadata>>();
export function withRequestContext<T>(metadata: RequestMetadata, operation: () => T): T {
  return storage.run(Object.freeze({ ...metadata }), operation);
}
export function currentRequestMetadata(): Readonly<RequestMetadata> | undefined {
  return storage.getStore();
}
