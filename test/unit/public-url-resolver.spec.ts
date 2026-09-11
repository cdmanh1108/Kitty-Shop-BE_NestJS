import { resolvePublicUrl } from '../../src/common/storage/public-url.resolver';

describe('PublicUrlResolver', () => {
  it('resolves key with standard base URL', () => {
    const url = resolvePublicUrl('https://assets.example.com', 'shops/main/products/sp001/abc.jpg');
    expect(url).toBe('https://assets.example.com/shops/main/products/sp001/abc.jpg');
  });

  it('normalizes base URL with trailing slash', () => {
    const url = resolvePublicUrl('https://assets.example.com/', 'shops/main/products/sp001/abc.jpg');
    expect(url).toBe('https://assets.example.com/shops/main/products/sp001/abc.jpg');
  });

  it('normalizes storage key with leading slashes', () => {
    const url = resolvePublicUrl('https://assets.example.com', '///shops/main/products/sp001/abc.jpg');
    expect(url).toBe('https://assets.example.com/shops/main/products/sp001/abc.jpg');
  });

  it('handles empty or undefined base URL gracefully', () => {
    const url1 = resolvePublicUrl('', 'shops/main/products/sp001/abc.jpg');
    expect(url1).toBe('/shops/main/products/sp001/abc.jpg');

    const url2 = resolvePublicUrl(undefined, 'shops/main/products/sp001/abc.jpg');
    expect(url2).toBe('/shops/main/products/sp001/abc.jpg');
  });

  it('supports seamless CDN/bucket domain migration without touching the key', () => {
    const key = 'shops/main/products/sp001/abc.jpg';
    const oldUrl = resolvePublicUrl('https://pub-abc.r2.dev', key);
    const newUrl = resolvePublicUrl('https://assets.example.com', key);

    expect(oldUrl).toBe('https://pub-abc.r2.dev/shops/main/products/sp001/abc.jpg');
    expect(newUrl).toBe('https://assets.example.com/shops/main/products/sp001/abc.jpg');
    expect(oldUrl).not.toBe(newUrl);
  });
});
