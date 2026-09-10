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
