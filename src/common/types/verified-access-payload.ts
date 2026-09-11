import type { JwtAccessPayload } from './current-user';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Signature and expiration are checked by JwtService before this runtime shape check.
export function isVerifiedAccessPayload(value: unknown): value is JwtAccessPayload {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'sub' in value &&
    typeof value.sub === 'string' &&
    uuid.test(value.sub) &&
    'mid' in value &&
    typeof value.mid === 'string' &&
    uuid.test(value.mid) &&
    'sid' in value &&
    typeof value.sid === 'string' &&
    uuid.test(value.sid) &&
    'exp' in value &&
    typeof value.exp === 'number' &&
    Number.isSafeInteger(value.exp) &&
    'iat' in value &&
    typeof value.iat === 'number' &&
    Number.isSafeInteger(value.iat) &&
    value.exp > value.iat
  );
}
