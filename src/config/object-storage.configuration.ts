export interface ObjectStorageConfiguration {
  provider: string;
  endpoint: string;
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

/** Shared by Nest configuration and standalone maintenance commands. */
export function parseObjectStorageConfiguration(
  env: Record<string, unknown>,
): ObjectStorageConfiguration {
  const read = (name: string, fallback = ''): string => {
    const value = env[`OBJECT_STORAGE_${name}`];
    if (value === undefined || value === '') return fallback;
    if (typeof value !== 'string') throw new Error(`OBJECT_STORAGE_${name} phải là chuỗi ký tự.`);
    return value.trim();
  };
  const readPositiveInteger = (
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): number => {
    const raw = read(name, String(fallback));
    if (!/^\d+$/.test(raw)) throw new Error(`OBJECT_STORAGE_${name} phải là số nguyên dương.`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`OBJECT_STORAGE_${name} phải nằm trong khoảng ${min} đến ${max}.`);
    return value;
  };
  const config = {
    provider: read('PROVIDER', 's3'),
    endpoint: read('ENDPOINT'),
    region: read('REGION', 'auto'),
    bucket: read('BUCKET'),
    privateBucket: read('PRIVATE_BUCKET'),
    accessKeyId: read('ACCESS_KEY_ID'),
    secretAccessKey: read('SECRET_ACCESS_KEY'),
    publicBaseUrl: read('PUBLIC_BASE_URL'),
    operationTimeoutMs: readPositiveInteger('OPERATION_TIMEOUT_MS', 10_000, 100, 120_000),
    cleanupTimeoutMs: readPositiveInteger('CLEANUP_TIMEOUT_MS', 3_000, 100, 60_000),
    maxAttempts: readPositiveInteger('MAX_ATTEMPTS', 2, 1, 5),
  };
  if (config.cleanupTimeoutMs > config.operationTimeoutMs)
    throw new Error(
      'OBJECT_STORAGE_CLEANUP_TIMEOUT_MS không được lớn hơn OBJECT_STORAGE_OPERATION_TIMEOUT_MS.',
    );
  if (config.provider !== 's3') throw new Error('OBJECT_STORAGE_PROVIDER phải là s3.');
  if (config.privateBucket && config.privateBucket === config.bucket)
    throw new Error('OBJECT_STORAGE_PRIVATE_BUCKET phải khác bucket hình ảnh công khai.');
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
        throw new Error('URL kho lưu trữ không hợp lệ.');
    } catch {
      throw new Error(
        `OBJECT_STORAGE_${name} phải là URL HTTP(S), không chứa thông tin đăng nhập, truy vấn hoặc phân đoạn.`,
      );
    }
  }
  // Public read-only serving may be configured without upload credentials.
  if (
    config.bucket ||
    config.privateBucket ||
    config.accessKeyId ||
    config.secretAccessKey ||
    config.endpoint
  ) {
    for (const [name, value] of [
      ['BUCKET', config.bucket],
      ['REGION', config.region],
      ['ACCESS_KEY_ID', config.accessKeyId],
      ['SECRET_ACCESS_KEY', config.secretAccessKey],
      ['PUBLIC_BASE_URL', config.publicBaseUrl],
    ]) {
      if (!value)
        throw new Error(`Cần cấu hình OBJECT_STORAGE_${name} khi bật tải lên kho lưu trữ.`);
    }
  }
  return config;
}
