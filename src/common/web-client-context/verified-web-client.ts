import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const WEB_CLIENT_CONTEXT_HEADER = 'x-kitty-web-client-context';
export const WEB_CLIENT_CONTEXT_REQUIRED = 'web-client-context-required';
const verifiedClients = new WeakMap<object, string>();

// Keep this wire format aligned with the storefront signer. This is an IP assertion,
// never a user credential. Fresh signatures for one IP must share the same rate budget.
export function canonicalClientIp(value: string): string | undefined {
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6 || value.includes('%')) return undefined;
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(normalized);
  if (!mapped) return normalized;
  const high = Number.parseInt(mapped[1]!, 16);
  const low = Number.parseInt(mapped[2]!, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function verifyWebClientContext(
  proof: string,
  secret: string,
  method: string,
  target: string,
  nowMs: number,
): string | undefined {
  if (proof.length > 180) return undefined;
  const match = /^v1\|(\d{13})\|([^|]+)\|([a-f0-9]{64})$/.exec(proof);
  if (!match || match[0] !== proof) return undefined;
  const [, timestamp, ip, signature] = match;
  if (!timestamp || !ip || !signature || canonicalClientIp(ip) !== ip) return undefined;
  const age = nowMs - Number(timestamp);
  if (age > 60_000 || age < -5_000) return undefined;
  const expected = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`kitty-web-client.v1\n${timestamp}\n${ip}\n${method.toUpperCase()}\n${target}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex')) ? ip : undefined;
}

export function bindVerifiedWebClient(request: object, ip: string): void {
  verifiedClients.set(request, ip);
}

export function verifiedWebClientIp(request: object): string | undefined {
  return verifiedClients.get(request);
}
