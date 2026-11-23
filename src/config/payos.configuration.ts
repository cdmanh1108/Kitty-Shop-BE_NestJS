export interface PayosConfiguration {
  checkoutEnabled: boolean;
  ttlMinutes: number;
  webOrigin?: string;
  credentials?: { clientId: string; apiKey: string; checksumKey: string };
}

export function parsePayosConfiguration(env: Record<string, unknown>): PayosConfiguration {
  const read = (key: string) => (typeof env[key] === 'string' ? env[key].trim() : '');
  const flag = read('PAYOS_CHECKOUT_ENABLED');
  if (flag && flag !== 'true' && flag !== 'false')
    throw new Error('PAYOS_CHECKOUT_ENABLED phải là true hoặc false.');

  const ttlMinutes = Number(read('PAYOS_PAYMENT_TTL_MINUTES') || '15');
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 120)
    throw new Error('PAYOS_PAYMENT_TTL_MINUTES phải là số nguyên từ 1 đến 120.');

  const checkoutEnabled = flag === 'true';
  const clientId = read('PAYOS_CLIENT_ID');
  const apiKey = read('PAYOS_API_KEY');
  const checksumKey = read('PAYOS_CHECKSUM_KEY');
  if (!(checkoutEnabled || clientId || apiKey || checksumKey))
    return { checkoutEnabled, ttlMinutes };
  if (!clientId || !apiKey || !checksumKey)
    throw new Error('Hãy cấu hình đủ PAYOS_CLIENT_ID, PAYOS_API_KEY và PAYOS_CHECKSUM_KEY.');

  const url = URL.parse(read('WEB_URL'));
  if (
    !url ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(env.NODE_ENV !== 'production' && url.protocol === 'http:' && url.hostname === 'localhost'))
  )
    throw new Error('WEB_URL phải là địa chỉ gốc hợp lệ của storefront để dùng payOS.');
  return {
    checkoutEnabled,
    ttlMinutes,
    webOrigin: url.origin,
    credentials: { clientId, apiKey, checksumKey },
  };
}
