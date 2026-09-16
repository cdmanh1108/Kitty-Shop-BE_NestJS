export interface WebAuthConfiguration {
  bypassEnabled: boolean;
  bypassCode: string;
  otpTtlSeconds: number;
  otpMaxAttempts: number;
  resendCooldownSeconds: number;
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTokenTtlDays: number;
  otpHashSecret: string;
}

export function parseWebAuthConfiguration(env: Record<string, unknown>): WebAuthConfiguration {
  const flag = env.AUTH_OTP_BYPASS_ENABLED ?? 'false';
  if (flag !== 'true' && flag !== 'false')
    throw new Error('AUTH_OTP_BYPASS_ENABLED must be true or false');
  if (env.NODE_ENV === 'production' && flag === 'true')
    throw new Error('OTP bypass is forbidden in production');
  const code = env.AUTH_OTP_BYPASS_CODE ?? '';
  if (typeof code !== 'string' || (flag === 'true' && !/^\d{6}$/.test(code)))
    throw new Error('AUTH_OTP_BYPASS_CODE must contain six digits when enabled');
  const integer = (key: string, fallback: number, maximum: number): number => {
    const raw = env[key] ?? String(fallback);
    const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
      throw new Error(`${key} is outside its supported range`);
    return value;
  };
  return {
    bypassEnabled: flag === 'true',
    bypassCode: code,
    otpTtlSeconds: integer('AUTH_OTP_TTL_SECONDS', 300, 1800),
    otpMaxAttempts: integer('AUTH_OTP_MAX_ATTEMPTS', 5, 10),
    resendCooldownSeconds: integer('AUTH_OTP_RESEND_COOLDOWN_SECONDS', 60, 600),
    accessSecret: typeof env.WEB_JWT_ACCESS_SECRET === 'string' ? env.WEB_JWT_ACCESS_SECRET : '',
    accessTtlSeconds: integer('WEB_JWT_ACCESS_TTL_SECONDS', 900, 86400),
    refreshTokenTtlDays: integer('WEB_REFRESH_TOKEN_TTL_DAYS', 30, 365),
    otpHashSecret: typeof env.AUTH_OTP_HASH_SECRET === 'string' ? env.AUTH_OTP_HASH_SECRET : '',
  };
}
