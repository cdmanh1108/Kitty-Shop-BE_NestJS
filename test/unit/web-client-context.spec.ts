import { createHmac } from 'node:crypto';
import { parseWebClientContextConfiguration } from '../../src/config/web-client-context.configuration';
import {
  canonicalClientIp,
  verifyWebClientContext,
} from '../../src/common/web-client-context/verified-web-client';

const secret = '819ef47c61bed08dc2365607ab8d34820f859eaaa8edb02b84de12d5e53885b5';
const now = 1794823200000;
const target = '/api/v1/web/auth/login';
// The same vector is asserted by the independently deployed Next signer tests.
const vector = `v1|${now}|2001:db8::1|274224d64a75762f31265edb00d7742d73198fd20028eec51f1f3755ed2463fe`;

function proof(timestamp: number, ip = '192.0.2.1'): string {
  const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`kitty-web-client.v1\n${timestamp}\n${ip}\nPOST\n${target}`)
    .digest('hex');
  return `v1|${timestamp}|${ip}|${signature}`;
}

describe('signed Web client context', () => {
  it('requires an independent hex secret in production without exposing its value', () => {
    expect(() => parseWebClientContextConfiguration({ NODE_ENV: 'production' })).toThrow(
      'required',
    );
    for (const value of [' ', 'short', 'g'.repeat(64), 'a'.repeat(63), `${secret} `]) {
      expect(() =>
        parseWebClientContextConfiguration({ WEB_BFF_CLIENT_CONTEXT_SECRET: value }),
      ).toThrow('64 hex');
    }
    for (const key of ['JWT_ACCESS_SECRET', 'WEB_JWT_ACCESS_SECRET', 'AUTH_OTP_HASH_SECRET']) {
      expect(() =>
        parseWebClientContextConfiguration({
          WEB_BFF_CLIENT_CONTEXT_SECRET: secret,
          [key]: secret,
        }),
      ).toThrow('separate');
    }
    expect(parseWebClientContextConfiguration({ NODE_ENV: 'test' })).toEqual({ required: false });
    expect(
      parseWebClientContextConfiguration({
        NODE_ENV: 'production',
        WEB_BFF_CLIENT_CONTEXT_SECRET: secret,
      }),
    ).toEqual({ required: true, secret });
  });

  it.each([
    ['192.0.2.1', '192.0.2.1'],
    ['2001:0DB8:0:0::1', '2001:db8::1'],
    ['::ffff:192.0.2.1', '192.0.2.1'],
    ['::FFFF:c000:201', '192.0.2.1'],
  ])('canonicalizes %s to one rate-limit identity', (ip, expected) => {
    expect(canonicalClientIp(ip)).toBe(expected);
  });

  it.each(['', '192.0.2.1, 192.0.2.2', '192.0.2.1:8080', '[::1]', 'fe80::1%eth0', '01.2.3.4'])(
    'rejects non-single IP %s',
    (ip) => {
      expect(canonicalClientIp(ip)).toBeUndefined();
    },
  );

  it('accepts the storefront wire vector and binds method, exact path and query', () => {
    expect(verifyWebClientContext(vector, secret, 'POST', target, now)).toBe('2001:db8::1');
    expect(verifyWebClientContext(vector, secret, 'GET', target, now)).toBeUndefined();
    expect(verifyWebClientContext(vector, secret, 'POST', target + '?a=1', now)).toBeUndefined();
    expect(verifyWebClientContext(vector, secret, 'POST', target + '/', now)).toBeUndefined();
    expect(verifyWebClientContext(vector, '00'.repeat(32), 'POST', target, now)).toBeUndefined();
    expect(
      verifyWebClientContext(vector.replace('::1', '::2'), secret, 'POST', target, now),
    ).toBeUndefined();
  });

  it('limits age and clock skew and rejects malformed/ambiguous assertions', () => {
    for (const timestamp of [now - 60_000, now + 5_000]) {
      expect(verifyWebClientContext(proof(timestamp), secret, 'POST', target, now)).toBe(
        '192.0.2.1',
      );
    }
    for (const timestamp of [now - 60_001, now + 5_001]) {
      expect(verifyWebClientContext(proof(timestamp), secret, 'POST', target, now)).toBeUndefined();
    }
    for (const invalid of [
      vector + ', ' + vector,
      vector + '\n',
      vector.replace('v1', 'v2'),
      vector.slice(0, -1),
      proof(now, '::ffff:192.0.2.1'),
      'x'.repeat(1000),
    ]) {
      expect(verifyWebClientContext(invalid, secret, 'POST', target, now)).toBeUndefined();
    }
  });
});
