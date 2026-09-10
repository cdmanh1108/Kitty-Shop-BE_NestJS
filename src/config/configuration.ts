export interface AppConfiguration {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  appName: string;
  appUrl: string;
  corsOrigins: string[];
  trustProxy: boolean;
  swaggerEnabled: boolean;
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  refreshTokenTtlDays: number;
  rateLimitTtlMs: number;
  rateLimitLimit: number;
}

const asBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
};

const asNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default (): AppConfiguration => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: asNumber(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  appName: process.env.APP_NAME ?? 'Rental Shop API',
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  trustProxy: asBoolean(process.env.TRUST_PROXY, false),
  swaggerEnabled: asBoolean(process.env.SWAGGER_ENABLED, true),
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  jwtAccessTtlSeconds: asNumber(process.env.JWT_ACCESS_TTL_SECONDS, 900),
  refreshTokenTtlDays: asNumber(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
  rateLimitTtlMs: asNumber(process.env.RATE_LIMIT_TTL_MS, 60_000),
  rateLimitLimit: asNumber(process.env.RATE_LIMIT_LIMIT, 300),
});
