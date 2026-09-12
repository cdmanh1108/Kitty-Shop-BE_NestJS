# Object storage and Product media

## Architecture

```text
Catalog application/domain -> media metadata / repository port
Catalog Prisma read projection -> PublicMediaUrlResolver -> configured public URL
Storage callers -> ObjectStoragePort -> S3ObjectStorageAdapter -> S3-compatible provider
```

Business code does not know buckets, public domains or SDKs. Catalog repositories receive `PUBLIC_MEDIA_URL_RESOLVER` through DI; list, detail and media-command responses share the resolver. URL derivation is local and performs no HEAD/GET request. Storage mutation capabilities remain on the existing ObjectStoragePort; no unused private-document API was added.

## Persistence semantics

The schema deliberately retains `storageKey String?` and `url String` during legacy migration:

- With `storageKey`, the key is the canonical identity. API `url` is derived from configured publicBaseUrl. The stored `url` remains original external provenance for retry/force migration; it is not a serving fallback when a key exists.
- Without `storageKey`, `url` is an external/legacy source and is returned unchanged.
- Normal Product create/add-media currently accepts external URLs, not uploaded keys. There is no runtime upload endpoint in this task. Legacy importer writes external URLs. The media migration uploads first and updates only the key plus migration metadata; it never persists the generated public URL.

No schema migration or data rewrite is needed. Existing rows are preserved. Historical full provider URLs without a key remain legacy external URLs until explicitly migrated.

Changing the public domain changes responses without DB updates. Changing bucket/provider additionally requires moving objects under the same keys and configuring appropriate public serving; configuration alone does not copy objects or set bucket access policies.

## Configuration

Existing environment names remain unchanged. `configuration.ts` exposes one typed `objectStorage` object. Nest validation and standalone storage commands share `parseObjectStorageConfiguration`; runtime modules do not fall back to raw environment names.

```env
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_ENDPOINT=https://s3.example.com
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET=product-assets
OBJECT_STORAGE_ACCESS_KEY_ID=example-access-key
OBJECT_STORAGE_SECRET_ACCESS_KEY=example-secret-key
OBJECT_STORAGE_PUBLIC_BASE_URL=https://assets.example.com
```

The endpoint may be omitted for AWS S3; set the appropriate AWS region. Cloudflare R2 uses its S3-compatible account endpoint and region `auto`. MinIO also uses provider `s3`, not a different provider label.

All storage values may be omitted when storage is unused. A publicBaseUrl alone supports read-only URL resolution. Configuring bucket, endpoint or either credential activates upload validation: bucket, region, both credentials and publicBaseUrl must be present, in every environment including production. URLs must be valid HTTP(S) without credentials, query or fragment. Validation errors name fields without echoing values.

Missing storage mutation configuration rejects PUT/HEAD/DELETE rather than pretending an object is absent. Missing publicBaseUrl for a key-backed media read fails explicitly instead of generating a broken relative URL. Deployments serving internal media must configure publicBaseUrl even when uploads are disabled.

## Keys and public access

Existing keys remain `shops/<normalized-shop-code>/products/<normalized-product-code>/<sha256>.<extension>`. Content hashes make retries stable, with HEAD-before-PUT and immutable caching. Keys contain neither provider hostname nor bucket nor credentials. Public URL resolution encodes each path segment independently, preserving slash separators.

The existing key scheme assumes normalized shop codes are distinct. Operators must preserve that invariant across tenant codes; this cleanup does not rename existing keys. Public Product objects must contain no identity documents or secrets.

Product media uses public/CDN-safe access. Future identity/collateral documents require private objects, authorized/signed access and retention controls. None of that private-document infrastructure is implemented here.

## Maintenance commands

```bash
npm run media:sync-storage -- --dry-run --limit 10
npm run media:sync-storage -- --apply --limit 10
npm run object-storage:check
```

Sync remains dry-run by default, supports local cache/resume, bounded concurrency, download retry/backoff and MIME/hash validation. Upload completes before the DB update, outside any DB transaction. A rerun can reuse an uploaded object after a failed DB update. `--force` reprocesses the retained original source. No automatic deletion was added to archive/delete flows.

`object-storage:check` performs PUT/HEAD/DELETE against the configured bucket: it is a live mutation diagnostic, not an offline dry-run. It no longer prints any part of the access key. Run it only against an authorized target.

Current download implementation validates the 15 MB limit after buffering and clears its timeout after headers. Those existing limits do not guarantee a bounded streamed response/body deadline; changing the downloader is outside this boundary cleanup.

See [Task 6 report](STORAGE_CLI_BOUNDARIES.md) for verification and remaining limitations.
