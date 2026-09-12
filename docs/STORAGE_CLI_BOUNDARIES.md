# Task 6 — Object storage and legacy CLI boundaries

Historical snapshot. [Task 7](STABILIZATION.md) adds actual CLI regression coverage, fixes body timeout and dry-run precedence, and removes private-workbook test dependencies.

## Root causes and final architecture

Catalog read/command projections constructed public URLs from raw environment values. StorageModule looked up uppercase environment names rather than the camelCase configuration loader output, then silently bypassed typed configuration. Missing public configuration produced relative URLs, and disabled storage HEAD returned a misleading missing-object result. CatalogModule registered/exported the XLSX importer, pulling CLI dependencies into HTTP startup.

```text
Catalog application/domain -> metadata and repository port
Prisma Catalog projections -> injected PublicMediaUrlResolver -> configured public URL
Storage operations -> ObjectStoragePort -> S3-compatible adapter

Legacy import script -> LegacyCatalogImportModule -> importer/parser -> Prisma + AuditPort
HTTP AppModule -> CatalogModule -> no legacy importer or XLSX
```

The importer remains infrastructure tooling and retains its existing per-product Prisma transactions; it does not introduce a new application service issuing Prisma queries. The standalone CLI context includes configuration, database and audit support, without HTTP Catalog, authentication guards or scheduler initialization. `xlsx` stays in dependencies because operational CLI commands require it.

## Media persistence and write audit

No database migration. The schema comment now documents the existing transition model:

| Path                                       | Persistence                                                                      | Serving                               |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------- |
| Product create/add-media                   | External URL; no runtime upload endpoint exists                                  | External URL while storageKey is null |
| Legacy importer                            | Original external URL and legacy metadata                                        | Same external fallback                |
| Media sync                                 | Upload/HEAD first, then storageKey and migration metadata; original URL retained | Derived public URL from the key       |
| Product list/detail/media-command response | No URL write                                                                     | Shared injected resolver              |
| Seed                                       | No new managed upload path                                                       | Existing fixture semantics            |

For managed media, storageKey is canonical; retained url is migration provenance, not a fallback if public configuration is missing. New migration writes do not persist provider-derived URLs. Existing key/URL data remain untouched. No automatic object deletion, new upload endpoint or private-document workflow was added.

Public URLs encode path segments while preserving separators. Changing publicBaseUrl changes API responses without rewriting DB rows. A provider/bucket move still requires copying objects under the same keys and configuring public access.

## Configuration changes

- New `src/config/object-storage.configuration.ts` centralizes typed storage parsing and validation.
- `AppConfiguration.objectStorage` replaces the unused flat storage properties; external environment names remain unchanged, so `.env.example` needs no rename.
- Nest StorageModule uses typed ConfigService exclusively. Both standalone storage scripts share the same parser.
- A fully unused storage configuration is allowed. A public base URL alone supports read-only serving. Bucket/endpoint/credentials activate complete upload-config validation, including public URL, in all environments.
- Endpoint is optional for AWS S3. Provider is `s3` for all supported S3-compatible services. URLs reject embedded credentials, query and fragment; errors do not echo secret values.
- Disabled storage operations fail explicitly, including HEAD. Internal media without public URL config fails rather than returning a broken relative path.
- Storage health diagnostic no longer prints access-key fragments.

## Files moved and changed

Moved all seven importer files from `src/modules/catalog/infrastructure/import/` to `src/cli/legacy-catalog/`: service, types, mapper, normalizer, validator, color parser and XLSX parser. Parsing/business-import behavior is retained; test imports now use the CLI location. The old directory is removed.

Added `legacy-catalog-import.module.ts` for standalone DI. `scripts/import-legacy-catalog.ts` now boots this module and requires explicit `--file`; dry-run overrides apply, and the printed mode matches execution.

Storage/config changes are in `configuration.ts`, `env.validation.ts`, the new storage config parser, `storage.module.ts` and `public-url.resolver.ts`. Catalog repository construction and its Product query/media-command helpers receive the resolver. Storage scripts reuse central config parsing. Existing direct-construction tests inject a deterministic resolver. README, architecture, storage and import docs reflect the final model.

## Tests and verification

Added:

- `test/unit/object-storage-config.spec.ts`: valid/disabled config, required upload settings, safe validation errors, malformed URLs, legacy fallback.
- `test/storage-architecture.spec.ts`: HTTP runtime import graph excludes CLI/XLSX; Catalog business layers exclude SDK/provider/environment coupling.
- `test/integration/storage-boundary.integration.spec.ts`: actual PostgreSQL media rows remain unchanged across two public domains; standalone CLI module parses a synthetic workbook and performs dry-run with zero persisted catalog writes, even when apply is also supplied.

Updated resolver tests cover trailing/leading slashes, nested keys, spaces/special characters, missing keys/configuration and domain portability. Existing adapter, MIME/hash, media-sync, importer parser/validation/idempotency tests remain passing.

```text
lint                 PASS
typecheck            PASS
unit                 PASS — 31 suites, 332 tests
integration          PASS — 12 suites, 67 tests
e2e                  PASS — 3 suites, 10 tests
build                PASS
quality              PASS
openapi:export       PASS — generated contract unchanged
test:db:migrate      PASS — all 5 committed migrations on empty PostgreSQL 17
```

An initial integration attempt failed because its disposable container no longer existed. Recreated an isolated container on port 55433, migrated it, and reran the complete integration/E2E suites successfully. No application database was used. Full format command was run; unrelated formatting-only changes were removed.

Actual script verification:

- Import CLI dry-run: SUCCESS with an empty synthetic workbook and test shop; zero mutations. Separately, the integration test dry-runs one valid synthetic Product through the standalone module.
- Media sync CLI dry-run: one synthetic cached JPEG inspected, one cache hit, zero network downloads, zero uploads, zero DB updates, zero failures. Source URL and null storageKey were checked unchanged afterward.
- Live object-storage health check was not run because it writes/deletes remote objects. Adapter behavior is verified with mocked SDK responses; no live credentials/provider access was needed.

## Remaining limitations

Existing download code buffers the body before enforcing its size limit and ends its timeout after response headers. Existing media-sync unit tests exercise helper/idempotency behavior, not a complete live download/upload/retry pipeline. This cleanup preserves that behavior without claiming live-provider verification.

The existing normalized shop-code key namespace assumes distinct normalized codes; keys were not renamed. Legacy full URLs without keys remain tied to their external origin until migrated. Some existing importer regression tests still depend on the local ignored legacy workbook; new CLI integration verification uses only synthetic data. Private workbooks were neither modified nor committed.

Product media remains public. Future identity/collateral documents require private authorized/signed access and retention controls, which are out of scope.
