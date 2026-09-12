import { parseObjectStorageConfiguration } from '../../src/config/object-storage.configuration';
import { ConfiguredPublicMediaUrlResolver } from '../../src/common/storage/public-url.resolver';

describe('Object storage configuration boundary', () => {
  const env = {
    NODE_ENV: 'production',
    OBJECT_STORAGE_BUCKET: 'assets',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'synthetic-key',
    OBJECT_STORAGE_SECRET_ACCESS_KEY: 'synthetic-secret',
    OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://assets.example.com/',
  };
  it('parses a complete upload configuration and permits unconfigured storage', () => {
    expect(parseObjectStorageConfiguration(env)).toMatchObject({
      bucket: 'assets',
      region: 'auto',
      publicBaseUrl: 'https://assets.example.com/',
    });
    expect(parseObjectStorageConfiguration({}).bucket).toBe('');
  });
  it.each([
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    'OBJECT_STORAGE_PUBLIC_BASE_URL',
  ])('rejects missing %s without leaking credentials', (field) => {
    try {
      parseObjectStorageConfiguration({ ...env, [field]: '' });
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain(field);
      expect(String(error)).not.toContain('synthetic-key');
      expect(String(error)).not.toContain('synthetic-secret');
    }
  });
  it('rejects malformed URLs and embedded credentials without echoing them', () => {
    expect(() =>
      parseObjectStorageConfiguration({
        ...env,
        OBJECT_STORAGE_ENDPOINT: 'https://user:secret@example.com',
      }),
    ).toThrow('without credentials');
    expect(() =>
      parseObjectStorageConfiguration({ ...env, OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://' }),
    ).toThrow('HTTP(S)');
  });
  it('preserves external URLs without storage configuration and derives internal URLs centrally', () => {
    const external = { storageKey: null, url: 'https://legacy.example.com/a.jpg' };
    expect(new ConfiguredPublicMediaUrlResolver('').resolve(external)).toBe(external.url);
    const internal = { ...external, storageKey: 'shops/main/a.jpg' };
    expect(new ConfiguredPublicMediaUrlResolver('https://new.example.com').resolve(internal)).toBe(
      'https://new.example.com/shops/main/a.jpg',
    );
    expect(internal.url).toBe(external.url);
  });
});
