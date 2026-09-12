import { resolvePublicUrl } from '../../src/common/storage/public-url.resolver';

describe('PublicUrlResolver', () => {
  it('resolves key with standard base URL', () => {
    const url = resolvePublicUrl('https://assets.example.com', 'shops/main/products/sp001/abc.jpg');
    expect(url).toBe('https://assets.example.com/shops/main/products/sp001/abc.jpg');
  });

  it('normalizes base URL with trailing slash', () => {
    const url = resolvePublicUrl(
      'https://assets.example.com/',
      'shops/main/products/sp001/abc.jpg',
    );
    expect(url).toBe('https://assets.example.com/shops/main/products/sp001/abc.jpg');
  });

  it('normalizes storage key with leading slashes', () => {
    const url = resolvePublicUrl(
      'https://assets.example.com',
      '///shops/main/products/sp001/abc.jpg',
    );
    expect(url).toBe('https://assets.example.com/shops/main/products/sp001/abc.jpg');
  });

  it('rejects missing public configuration instead of returning a broken relative URL', () => {
    expect(() => resolvePublicUrl('', 'key')).toThrow('OBJECT_STORAGE_PUBLIC_BASE_URL');
    expect(() => resolvePublicUrl(undefined, 'key')).toThrow('OBJECT_STORAGE_PUBLIC_BASE_URL');
  });
  it('encodes path segments and rejects empty keys', () => {
    expect(resolvePublicUrl('https://assets.example.com/', 'shops/main/a b#%.jpg')).toBe(
      'https://assets.example.com/shops/main/a%20b%23%25.jpg',
    );
    expect(() => resolvePublicUrl('https://assets.example.com', '')).toThrow(
      'key must not be empty',
    );
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
