const required = (config: Record<string, unknown>, key: string): string => {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
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
