export interface WebClientContextConfiguration {
  readonly secret?: string;
  readonly required: boolean;
}

export function parseWebClientContextConfiguration(
  env: Record<string, unknown>,
): WebClientContextConfiguration {
  const required = env.NODE_ENV === 'production';
  const raw = env.WEB_BFF_CLIENT_CONTEXT_SECRET;
  if (raw === undefined || raw === '') {
    if (required) throw new Error('WEB_BFF_CLIENT_CONTEXT_SECRET is required in production.');
    return { required };
  }
  if (typeof raw !== 'string' || raw.length !== 64 || !/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new Error(
      'WEB_BFF_CLIENT_CONTEXT_SECRET must be 32 random bytes encoded as 64 hex characters.',
    );
  }
  if ([env.JWT_ACCESS_SECRET, env.WEB_JWT_ACCESS_SECRET, env.AUTH_OTP_HASH_SECRET].includes(raw)) {
    throw new Error('WEB_BFF_CLIENT_CONTEXT_SECRET must be separate from authentication secrets.');
  }
  return { required, secret: raw };
}
