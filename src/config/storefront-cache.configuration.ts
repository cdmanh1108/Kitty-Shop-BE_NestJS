export interface StorefrontCacheConfiguration {
  endpoint: string;
  secret: string;
}

export function parseStorefrontCacheConfiguration(
  env: Record<string, unknown>,
): StorefrontCacheConfiguration | null {
  const rawOrigin = env.STOREFRONT_REVALIDATION_ORIGIN;
  const rawSecret = env.STOREFRONT_REVALIDATION_SECRET;
  const originValue = typeof rawOrigin === 'string' ? rawOrigin.trim() : '';
  const secret = typeof rawSecret === 'string' ? rawSecret.trim() : '';
  if (!originValue && !secret) return null;
  if (!/^[0-9a-f]{64}$/i.test(secret)) {
    throw new Error('STOREFRONT_REVALIDATION_SECRET must be 32 random bytes encoded as hex.');
  }
  const origin = URL.parse(originValue);
  if (
    !origin ||
    !['https:', 'http:'].includes(origin.protocol) ||
    (env.NODE_ENV === 'production' && origin.protocol !== 'https:') ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error(
      'STOREFRONT_REVALIDATION_ORIGIN must be a storefront origin (HTTPS in production).',
    );
  }
  return { endpoint: `${origin.origin}/api/internal/storefront-cache`, secret };
}
