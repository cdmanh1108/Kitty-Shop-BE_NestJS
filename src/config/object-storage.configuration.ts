export interface ObjectStorageConfiguration {
  provider: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

/** Shared by Nest configuration and standalone maintenance commands. */
export function parseObjectStorageConfiguration(
  env: Record<string, unknown>,
): ObjectStorageConfiguration {
  const read = (name: string, fallback = ''): string => {
    const value = env[`OBJECT_STORAGE_${name}`];
    if (value === undefined || value === '') return fallback;
    if (typeof value !== 'string') throw new Error(`OBJECT_STORAGE_${name} must be a string`);
    return value.trim();
  };
  const config = {
    provider: read('PROVIDER', 's3'),
    endpoint: read('ENDPOINT'),
    region: read('REGION', 'auto'),
    bucket: read('BUCKET'),
    accessKeyId: read('ACCESS_KEY_ID'),
    secretAccessKey: read('SECRET_ACCESS_KEY'),
    publicBaseUrl: read('PUBLIC_BASE_URL'),
  };
  if (config.provider !== 's3') throw new Error('OBJECT_STORAGE_PROVIDER must be s3');
  for (const [name, value] of [
    ['ENDPOINT', config.endpoint],
    ['PUBLIC_BASE_URL', config.publicBaseUrl],
  ]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
    } catch {
      throw new Error(
        `OBJECT_STORAGE_${name} must be an HTTP(S) URL without credentials, query or fragment`,
      );
    }
  }
  // Public read-only serving may be configured without upload credentials.
  if (config.bucket || config.accessKeyId || config.secretAccessKey || config.endpoint) {
    for (const [name, value] of [
      ['BUCKET', config.bucket],
      ['REGION', config.region],
      ['ACCESS_KEY_ID', config.accessKeyId],
      ['SECRET_ACCESS_KEY', config.secretAccessKey],
      ['PUBLIC_BASE_URL', config.publicBaseUrl],
    ]) {
      if (!value)
        throw new Error(
          `OBJECT_STORAGE_${name} is required when object storage uploads are configured`,
        );
    }
  }
  return config;
}
