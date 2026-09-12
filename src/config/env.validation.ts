import { parseObjectStorageConfiguration } from './object-storage.configuration';
const required = (config: Record<string, unknown>, key: string): string => {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
};

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  if (
    config.NODE_ENV !== undefined &&
    (typeof config.NODE_ENV !== 'string' ||
      !['development', 'test', 'production'].includes(config.NODE_ENV))
  ) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const isProduction = config.NODE_ENV === 'production';

  if (
    config.LOG_LEVEL !== undefined &&
    (typeof config.LOG_LEVEL !== 'string' ||
      !['fatal', 'error', 'warn', 'log', 'debug', 'verbose'].includes(config.LOG_LEVEL))
  ) {
    throw new Error('LOG_LEVEL must be fatal, error, warn, log, debug or verbose');
  }

  if (config.PORT !== undefined) {
    const value = config.PORT;
    const parsed =
      typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error('PORT must be an integer between 1 and 65535');
    }
  }

  for (const key of ['JWT_ACCESS_TTL_SECONDS', 'REFRESH_TOKEN_TTL_DAYS']) {
    const value = config[key];
    if (value === undefined) continue;
    const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    const maximum = key === 'JWT_ACCESS_TTL_SECONDS' ? 86_400 : 365;
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
      throw new Error(key + ' must be a positive integer within the supported lifetime');
    }
  }

  for (const key of ['RATE_LIMIT_TTL_MS', 'RATE_LIMIT_LIMIT']) {
    const value = config[key];
    if (value === undefined) continue;
    const parsed =
      typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(key + ' must be a positive integer');
    }
  }

  if (config.TRUST_PROXY !== undefined) {
    const value =
      typeof config.TRUST_PROXY === 'string' ? config.TRUST_PROXY.trim().toLowerCase() : '';
    if (value !== 'true' && value !== 'false') {
      throw new Error('TRUST_PROXY must be either "true" or "false"');
    }
  }

  if (config.SWAGGER_ENABLED !== undefined) {
    const value =
      typeof config.SWAGGER_ENABLED === 'string' ? config.SWAGGER_ENABLED.trim().toLowerCase() : '';
    if (value !== 'true' && value !== 'false') {
      throw new Error('SWAGGER_ENABLED must be either "true" or "false"');
    }
  }

  if (config.SKIP_DATABASE_CONNECT !== 'true') {
    required(config, 'DATABASE_URL');
  }

  const jwtSecret = required(config, 'JWT_ACCESS_SECRET');
  if (jwtSecret.length < 32 || jwtSecret === 'replace-with-at-least-32-random-characters') {
    throw new Error('JWT_ACCESS_SECRET must be a real secret with at least 32 characters');
  }
  const weakSecrets = ['secret', 'changeme', 'password', '123456', 'development'];
  if (isProduction && weakSecrets.some((w) => jwtSecret.toLowerCase().includes(w))) {
    throw new Error(
      'JWT_ACCESS_SECRET contains weak or placeholder values and cannot be used in production',
    );
  }

  if (isProduction && typeof config.CORS_ORIGINS === 'string') {
    const origins = config.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (origins.includes('*')) {
      throw new Error('CORS_ORIGINS cannot contain wildcard "*" in production with credentials');
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
      throw new Error('DEFAULT_ADMIN_PASSWORD must be changed before production');
    }
  }

  parseObjectStorageConfiguration(config);

  return config;
}
