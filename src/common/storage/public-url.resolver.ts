/**
 * Centralized public URL resolver for object storage assets.
 * Normalizes base URLs and storage keys to eliminate double slashes or missing slashes.
 *
 * Example:
 * base: https://assets.example.com/
 * key: shops/main/products/sp001/abc.jpg
 * result: https://assets.example.com/shops/main/products/sp001/abc.jpg
 */
export function resolvePublicUrl(publicBaseUrl: string | undefined | null, storageKey: string): string {
  const cleanKey = storageKey.trim().replace(/^\/+/, '');
  if (!publicBaseUrl || publicBaseUrl.trim() === '') {
    return `/${cleanKey}`;
  }
  const cleanBase = publicBaseUrl.trim().replace(/\/+$/, '');
  return `${cleanBase}/${cleanKey}`;
}
