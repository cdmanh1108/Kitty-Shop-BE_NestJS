/**
 * Centralized public URL resolver for object storage assets.
 * Normalizes base URLs and storage keys to eliminate double slashes or missing slashes.
 *
 * Example:
 * base: https://assets.example.com/
 * key: shops/main/products/sp001/abc.jpg
 * result: https://assets.example.com/shops/main/products/sp001/abc.jpg
 */
export function resolvePublicUrl(
  publicBaseUrl: string | undefined | null,
  storageKey: string,
): string {
  const cleanKey = storageKey.trim().replace(/^\/+/, '');
  if (!publicBaseUrl || publicBaseUrl.trim() === '') {
    throw new Error('OBJECT_STORAGE_PUBLIC_BASE_URL is required to resolve internal media');
  }
  if (!cleanKey) throw new Error('Object storage key must not be empty');
  const cleanBase = publicBaseUrl.trim().replace(/\/+$/, '');
  return `${cleanBase}/${cleanKey.split('/').map(encodeURIComponent).join('/')}`;
}

export interface PublicMediaUrlResolver {
  resolve(media: { storageKey: string | null; url: string }): string;
}
export const PUBLIC_MEDIA_URL_RESOLVER = Symbol('PUBLIC_MEDIA_URL_RESOLVER');
export class ConfiguredPublicMediaUrlResolver implements PublicMediaUrlResolver {
  constructor(private readonly publicBaseUrl: string) {}
  resolve(media: { storageKey: string | null; url: string }): string {
    return media.storageKey !== null
      ? resolvePublicUrl(this.publicBaseUrl, media.storageKey)
      : media.url;
  }
}
