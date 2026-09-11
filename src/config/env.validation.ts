const required = (config: Record<string, unknown>, key: string): string => {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  if (
    config.LOG_LEVEL !== undefined &&
    (typeof config.LOG_LEVEL !== 'string' ||
      !['fatal', 'error', 'warn', 'log', 'debug', 'verbose'].includes(config.LOG_LEVEL))
  ) {
    throw new Error('LOG_LEVEL must be fatal, error, warn, log, debug or verbose');
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
  required(config, 'DATABASE_URL');
  const jwtSecret = required(config, 'JWT_ACCESS_SECRET');
  if (jwtSecret.length < 32 || jwtSecret === 'replace-with-at-least-32-random-characters') {
    throw new Error('JWT_ACCESS_SECRET must be a real secret with at least 32 characters');
  }
  if (config.NODE_ENV === 'production' && config.DEFAULT_ADMIN_PASSWORD === 'ChangeMe123!') {
    throw new Error('DEFAULT_ADMIN_PASSWORD must be changed before production');
  }
  return config;
}
