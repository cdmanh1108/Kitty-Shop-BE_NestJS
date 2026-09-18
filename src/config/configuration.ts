import { parseWebAuthConfiguration, type WebAuthConfiguration } from './web-auth.configuration';
import {
  parseObjectStorageConfiguration,
  type ObjectStorageConfiguration,
} from './object-storage.configuration';
export interface AppConfiguration {
  webAuth: WebAuthConfiguration;
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  appName: string;
  appUrl: string;
  /** Optional only when every storefront request supplies x-shop-code. */
  defaultShopCode?: string;
  corsOrigins: string[];
  trustProxy: boolean;
  swaggerEnabled: boolean;
  jwtAccessSecret: string;
  jwtAccessTtlSeconds: number;
  refreshTokenTtlDays: number;
  rateLimitTtlMs: number;
  rateLimitLimit: number;
  objectStorage: ObjectStorageConfiguration;
}

const asBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.trim() === '') return fallback;
  return value.trim().toLowerCase() === 'true';
};

const asNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default (): AppConfiguration => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';

  return {
    webAuth: parseWebAuthConfiguration(process.env),
    nodeEnv,
    port: asNumber(process.env.PORT, 3007),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    appName: process.env.APP_NAME ?? 'Rental Shop API',
    appUrl: process.env.APP_URL ?? 'http://localhost:3007',
    defaultShopCode: process.env.DEFAULT_SHOP_CODE?.trim() || undefined,
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    trustProxy: asBoolean(process.env.TRUST_PROXY, false),
    swaggerEnabled:
      process.env.SWAGGER_ENABLED !== undefined && process.env.SWAGGER_ENABLED.trim() !== ''
        ? asBoolean(process.env.SWAGGER_ENABLED, false)
        : !isProduction,
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    jwtAccessTtlSeconds: asNumber(process.env.JWT_ACCESS_TTL_SECONDS, 900),
    refreshTokenTtlDays: asNumber(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
    rateLimitTtlMs: asNumber(process.env.RATE_LIMIT_TTL_MS, 60_000),
    rateLimitLimit: asNumber(process.env.RATE_LIMIT_LIMIT, 300),
    objectStorage: parseObjectStorageConfiguration(process.env),
  };
};
