import { parseObjectStorageConfiguration } from './object-storage.configuration';
import { parseWebAuthConfiguration } from './web-auth.configuration';
const required = (config: Record<string, unknown>, key: string): string => {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${key}.`);
  }
  return value.trim();
};

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  parseWebAuthConfiguration(config);
  if (
    config.NODE_ENV !== undefined &&
    (typeof config.NODE_ENV !== 'string' ||
      !['development', 'test', 'production'].includes(config.NODE_ENV))
  ) {
    throw new Error('NODE_ENV phải là development, test hoặc production.');
  }
  const isProduction = config.NODE_ENV === 'production';

  if (
    config.LOG_LEVEL !== undefined &&
    (typeof config.LOG_LEVEL !== 'string' ||
      !['fatal', 'error', 'warn', 'log', 'debug', 'verbose'].includes(config.LOG_LEVEL))
  ) {
    throw new Error('LOG_LEVEL phải là fatal, error, warn, log, debug hoặc verbose.');
  }

  if (config.PORT !== undefined) {
    const value = config.PORT;
    const parsed =
      typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
    }
  }

  for (const key of ['JWT_ACCESS_TTL_SECONDS', 'REFRESH_TOKEN_TTL_DAYS']) {
    const value = config[key];
    if (value === undefined) continue;
    const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    const maximum = key === 'JWT_ACCESS_TTL_SECONDS' ? 86_400 : 365;
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
      throw new Error(key + ' phải là số nguyên dương trong thời hạn được hỗ trợ.');
    }
  }

  for (const key of ['RATE_LIMIT_TTL_MS', 'RATE_LIMIT_LIMIT']) {
    const value = config[key];
    if (value === undefined) continue;
    const parsed =
      typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(key + ' phải là số nguyên dương.');
    }
  }

  if (config.TRUST_PROXY !== undefined) {
    const value =
      typeof config.TRUST_PROXY === 'string' ? config.TRUST_PROXY.trim().toLowerCase() : '';
    if (value !== 'true' && value !== 'false') {
      throw new Error('TRUST_PROXY phải là "true" hoặc "false".');
    }
  }

  if (config.SWAGGER_ENABLED !== undefined) {
    const value =
      typeof config.SWAGGER_ENABLED === 'string' ? config.SWAGGER_ENABLED.trim().toLowerCase() : '';
    if (value !== 'true' && value !== 'false') {
      throw new Error('SWAGGER_ENABLED phải là "true" hoặc "false".');
    }
  }

  if (config.SKIP_DATABASE_CONNECT !== 'true') {
    required(config, 'DATABASE_URL');
  }

  const jwtSecret = required(config, 'JWT_ACCESS_SECRET');
  if (jwtSecret.length < 32 || jwtSecret === 'replace-with-at-least-32-random-characters') {
    throw new Error('JWT_ACCESS_SECRET phải là khóa bí mật thực tế có ít nhất 32 ký tự.');
  }
  const weakSecrets = ['secret', 'changeme', 'password', '123456', 'development'];
  if (isProduction && weakSecrets.some((w) => jwtSecret.toLowerCase().includes(w))) {
    throw new Error(
      'JWT_ACCESS_SECRET chứa giá trị yếu hoặc giá trị mẫu, không thể dùng trong môi trường production.',
    );
  }
  const webSecret = required(config, 'WEB_JWT_ACCESS_SECRET');
  const otpSecret = required(config, 'AUTH_OTP_HASH_SECRET');
  for (const [key, secret] of [
    ['WEB_JWT_ACCESS_SECRET', webSecret],
    ['AUTH_OTP_HASH_SECRET', otpSecret],
  ] as const) {
    if (secret.length < 32) throw new Error(`${key} phải có ít nhất 32 ký tự.`);
    if (isProduction && weakSecrets.some((weak) => secret.toLowerCase().includes(weak))) {
      throw new Error(`${key} chứa giá trị yếu hoặc giá trị mẫu.`);
    }
  }
  if (isProduction && new Set([jwtSecret, webSecret, otpSecret]).size !== 3) {
    throw new Error('Admin JWT, Web JWT và OTP hash phải dùng ba secret khác nhau.');
  }

  if (isProduction && typeof config.CORS_ORIGINS === 'string') {
    const origins = config.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (origins.includes('*')) {
      throw new Error(
        'CORS_ORIGINS không được chứa ký tự đại diện "*" trong môi trường production khi cho phép thông tin xác thực.',
      );
    }
  }

  if (isProduction) {
    const adminPassword = config.DEFAULT_ADMIN_PASSWORD;
    if (
      typeof adminPassword !== 'string' ||
      adminPassword.trim() === '' ||
      adminPassword === 'ChangeMe123!' ||
      ['password', '123456', 'admin'].includes(adminPassword.toLowerCase())
    ) {
      throw new Error(
        'Phải thay đổi DEFAULT_ADMIN_PASSWORD trước khi chạy trong môi trường production.',
      );
    }
  }

  parseObjectStorageConfiguration(config);

  return config;
}
