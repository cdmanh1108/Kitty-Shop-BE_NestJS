export interface AuthCleanupConfiguration {
  enabled: boolean;
  refreshTokenRetentionDays: number;
  otpRetentionHours: number;
  batchSize: number;
}

function boolean(env: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${key} phải là true hoặc false.`);
}

function integer(
  env: Record<string, unknown>,
  key: string,
  fallback: number,
  maximum: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${key} nằm ngoài phạm vi giá trị được hỗ trợ.`);
  }
  return value;
}

/**
 * Retains expired/consumed auth records long enough for replay investigation while
 * bounding ephemeral auth storage. Defaults are intentionally operational, not API input.
 */
export function parseAuthCleanupConfiguration(
  env: Record<string, unknown>,
): AuthCleanupConfiguration {
  return {
    enabled: boolean(env, 'AUTH_CLEANUP_ENABLED', true),
    refreshTokenRetentionDays: integer(env, 'AUTH_REFRESH_TOKEN_RETENTION_DAYS', 30, 3650),
    otpRetentionHours: integer(env, 'AUTH_OTP_RETENTION_HOURS', 24, 24 * 365),
    batchSize: integer(env, 'AUTH_CLEANUP_BATCH_SIZE', 500, 5000),
  };
}
