import { ConfigService } from '@nestjs/config';
import type { AppConfiguration } from '@config/configuration';
import { parseStorefrontCacheConfiguration } from '@config/storefront-cache.configuration';
import { HttpStorefrontCacheAdapter } from '@common/storefront-cache/http-storefront-cache.adapter';

const secret = 'a1'.repeat(32);
const origin = 'https://web.example.test';
const target = { endpoint: `${origin}/api/internal/storefront-cache`, secret };

afterEach(() => jest.restoreAllMocks());

describe('storefront cache notification', () => {
  it('derives the endpoint from a configured origin and keeps the feature optional', () => {
    expect(parseStorefrontCacheConfiguration({})).toBeNull();
    expect(
      parseStorefrontCacheConfiguration({
        NODE_ENV: 'production',
        STOREFRONT_REVALIDATION_ORIGIN: origin,
        STOREFRONT_REVALIDATION_SECRET: secret,
      }),
    ).toEqual(target);
  });

  it.each(['http://web.example.test', 'https://web.example.test/path'])(
    'rejects production origin %s',
    (badOrigin) => {
      expect(() =>
        parseStorefrontCacheConfiguration({
          NODE_ENV: 'production',
          STOREFRONT_REVALIDATION_ORIGIN: badOrigin,
          STOREFRONT_REVALIDATION_SECRET: secret,
        }),
      ).toThrow('STOREFRONT_REVALIDATION_ORIGIN');
    },
  );

  it('skips network calls for a disabled deployment', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const config = new ConfigService<AppConfiguration, true>({ storefrontCache: null });
    const adapter = new HttpStorefrontCacheAdapter(config, {
      create: () => ({ log: jest.fn(), error: jest.fn() }),
    });

    await adapter.invalidate('products');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the fixed scope and keeps failures out of the write result and error log details', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error('Transport error containing sensitive request data'));
    const error = jest.fn();
    const config = new ConfigService<AppConfiguration, true>({ storefrontCache: target });
    const adapter = new HttpStorefrontCacheAdapter(config, {
      create: () => ({ log: jest.fn(), error }),
    });

    await adapter.invalidate('categories');
    await expect(adapter.invalidate('products')).resolves.toBeUndefined();
    await expect(adapter.invalidate('products')).resolves.toBeUndefined();

    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock).toHaveBeenNthCalledWith(1, target.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: '{"scope":"categories"}',
      redirect: 'error',
      signal,
    });
    expect(error.mock.calls).toEqual([
      [{ event: 'storefront.cache.invalidation_failed', scope: 'products', status: 503 }],
      [{ event: 'storefront.cache.invalidation_failed', scope: 'products' }],
    ]);
  });
});
