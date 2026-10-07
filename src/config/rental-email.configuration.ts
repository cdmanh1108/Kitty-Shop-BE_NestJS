export interface RentalEmailConfiguration {
  enabled: boolean;
  webUrl: string;
}

export function parseRentalEmailConfiguration(
  env: Record<string, unknown>,
): RentalEmailConfiguration {
  const rawEnabled = env.RENTAL_EMAIL_ENABLED;
  if (
    rawEnabled !== undefined &&
    rawEnabled !== '' &&
    rawEnabled !== 'true' &&
    rawEnabled !== 'false'
  )
    throw new Error('RENTAL_EMAIL_ENABLED phải là true hoặc false.');
  const enabled =
    rawEnabled === undefined || rawEnabled === '' ? env.NODE_ENV !== 'test' : rawEnabled === 'true';
  const rawUrl = typeof env.WEB_URL === 'string' ? env.WEB_URL.trim() : '';
  if (enabled && env.NODE_ENV === 'production' && !rawUrl)
    throw new Error('Phải cấu hình WEB_URL để gửi email đơn thuê trong production.');
  const url = new URL(rawUrl || 'http://localhost:3000');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(
      'WEB_URL phải là địa chỉ gốc HTTP/HTTPS của website, không có thông tin đăng nhập hoặc đường dẫn.',
    );
  if (
    enabled &&
    env.NODE_ENV === 'production' &&
    (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('WEB_URL phải là địa chỉ HTTPS công khai trong production.');
  return { enabled, webUrl: url.origin };
}
