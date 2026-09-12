# Task 7 stabilization

## 1. Stabilization Summary

Rechecked Tasks 1–6 against current source. Existing real PostgreSQL races, archive/rate constraints, FE editor behavior, server read models, tenant isolation and real/mock import boundaries were retained. Added actual media-sync CLI regression coverage, concurrent NULL-variant rate protection and real importer rerun coverage. Replaced the importer test's private workbook dependency with a synthetic temporary workbook.

Two small CLI defects were corrected: explicit dry-run now wins regardless of argument order, and download timeout remains active through response-body consumption. Invalid numeric limit/concurrency values fail explicitly. Importing the script for tests no longer starts the CLI or loads dotenv.

## 2. Regression Test Matrix

| Area             | Invariant                                                                                                            | Test Type                 | Test/File                                                                                                 | Result |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| Rental/Inventory | Overlap; booking versus CLEANING/DAMAGED/LOST/RETIRED; overdue occupancy; return policy                              | PostgreSQL                | rental-concurrency.integration.spec.ts, inventory-occupancy.integration.spec.ts                           | PASS   |
| Archive          | Unreleased allocations block Product/Inventory archive; released allows archive                                      | PostgreSQL                | catalog-invariants.integration.spec.ts                                                                    | PASS   |
| RentalRate       | One active rate including concurrent NULL-variant scope; inactive history preserved                                  | PostgreSQL                | catalog-invariants.integration.spec.ts                                                                    | PASS   |
| Product Edit     | INACTIVE preservation, rate edits, partial failure, refetch and double submit                                        | FE component              | product-editor.test.tsx                                                                                   | PASS   |
| Read Models      | Bounded lookup, full dataset counts/summary, actual history                                                          | DB + FE                   | catalog-read-models.integration.spec.ts, inventory/read-models.test.tsx                                   | PASS   |
| Mock Boundary    | Real errors do not become mock success; no runtime mock dependency                                                   | FE architecture/component | api/real-boundaries.test.ts, products/real-boundary.test.tsx                                              | PASS   |
| Object Storage   | Key identity, URL portability, config safety; real CLI dry-run/resume/HEAD/upload ordering/retry/timeout/concurrency | Unit + DB                 | object-storage-config.spec.ts, media-sync-cli.spec.ts, storage-boundary.integration.spec.ts               | PASS   |
| Legacy Import    | Isolated bootstrap, synthetic parsing, dry-run and rerun without duplicates                                          | Unit + DB                 | legacy-catalog-import.service.spec.ts, storage-boundary.integration.spec.ts, storage-architecture.spec.ts | PASS   |
| Tenant Isolation | Lookup, counts, summary/history exclude other shops                                                                  | DB + E2E                  | catalog-read-models.integration.spec.ts, catalog-reads.e2e.spec.ts, tenant-isolation.integration.spec.ts  | PASS   |

Backend files above are under test/unit, test/integration, test/e2e or test; frontend files are under src. Existing auth/error suites cover status translation, request IDs, production sanitization and session failures. No duplicate snapshots or new test framework were introduced.

## 3. Architecture Drift Found

- AI project context still combined physical inventory with reservation/rental states.
- Architecture text implied Prisma models were application contracts despite domain-owned records.
- Backend read-model notes still referred to removed useAllProducts/productCompatibility.
- Storage roadmap described an adapter as future work although it exists.
- Import documentation exposed a real workbook filename and test counts depended on that local workbook.
- FE auth, feature/listing and mock ownership documents described obsolete mixed service composition and client-side Inventory collections.
- Product editor docs claimed invalidation of mock reports/dashboard after real Product writes.
- QA documentation described obsolete npm-network restrictions and overstated CI gates. Existing CI is manual-only and does not run integration/E2E.
- Clean install requires explicit Prisma generation before typechecking; npm ci alone left a generic client stub in this environment.

## 4. Documentation Changed

BE: AGENTS.md and .ai/00-project-context.md clarify ownership and verification; README/TESTING/QA clarify clean install and actual gates; ARCHITECTURE/APPLICATION_CONTRACTS/BUSINESS_TYPES reconcile persistence boundaries; API documents exact BE-to-FE generation commands; CATALOG_READ_MODELS removes obsolete compatibility references; LEGACY_CATALOG_IMPORT uses placeholder paths and current CLI semantics; OBJECT_STORAGE and ROADMAP reflect implemented adapter and timeout behavior. STORAGE_CLI_BOUNDARIES remains an explicitly historical Task 6 report.

FE: API_AUTH, FEATURE_BOUNDARIES, LISTING_ARCHITECTURE, MOCKS_AND_TYPES and PRODUCT_EDITOR reflect current data sources/invalidation. QA points to new TESTING.md. SOURCE_MANIFEST.txt reflects existing source paths. API_MIGRATION.md remains the canonical real/mock matrix.

## 5. Dead/Stale Code Removed

Removed the legacy importer unit test's hardcoded private workbook dependency and source-specific counts. Removed unconditional CLI execution/dotenv loading on module import from the media-sync script. No unrelated production modules, dependencies or schema were removed.

## 6. Final Architecture Map

```text
BE HTTP/API -> Application -> Domain records/ports <- Infrastructure
                                                    Prisma/PostgreSQL
                                                    Storage adapter/resolver
                                                    Audit/outbox persistence
Inventory owns operational condition; RentalItemAllocation owns occupancy.
PostgreSQL exclusion/unique constraints and Serializable transactions protect races.
Legacy CLI -> dedicated context -> parser/import infrastructure (outside HTTP Catalog).

FE page -> feature query/mutation -> real adapter -> central typed HTTP client
                                               -> generated OpenAPI contracts
Mock page -> explicit mock-services -> handlers -> in-memory fixtures/database
```

## 7. Real API / Mock Matrix

| Source                       | FE features                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Real                         | Auth, Rental Policy, Products, Catalog Lookups, Inventory                                   |
| Mock                         | Customers, Orders, Calendar, Delivery, Finance, Dashboard, Reports, Reminders, Shop Profile |
| Mixed independent categories | Global Search: real Products; mock Orders/Customers                                         |

## 8. Verification Results

Verification completed from clean dependencies as described below. Verification uses source copies in `.task7-verification` with npm ci and no .env/private workbook. In-place npm ci was ENV BLOCKED by locked Prisma DLL/esbuild executables; no user process was stopped. Missing dependency files were restored from the clean install, preserving locked binaries. Both original repository typechecks also passed afterward.

BE: npm ci PASS in isolated copy; db:generate PASS; lint/typecheck/unit/build PASS (341 unit tests in 32 suites); PostgreSQL migrations and 69 integration tests PASS; 10 E2E tests PASS. Quality PASS; OpenAPI export PASS. Quality and OpenAPI export use an explicit synthetic signing key because the isolated copy contains no .env. Export metadata also depends on APP_NAME: the default title differs from the committed Kitty Shop API title; paths and schemas are identical. Use the same APP_NAME for whole-document comparisons.

FE: npm ci PASS in isolated copy; check PASS (api:check, typecheck, lint, 253 tests in 30 files, build). api:sync and api:check PASS. Parsed BE/FE OpenAPI documents are semantically equal, including the isolated copies; no generated contract change was needed.

## 9. Remaining Known Risks

Unmigrated FE features remain simulations and real Product rental history remains unavailable. Live provider/browser workflows were not exercised; storage tests use controlled SDK/fetch responses. Download size is checked after buffering, so memory is not bounded by streaming validation. Product multi-request saves cannot roll back already successful HTTP commits. Existing CI requires manual dispatch and does not execute database suites automatically. These limitations are documented, not new blockers for the next scoped feature.

## 10. Readiness Decision

READY FOR NEXT FEATURE

Final full-document comparison with APP_NAME=Kitty Shop API: PASS. Verification copies/logs remain under workspace .task7-verification; the disposable PostgreSQL container was stopped. Task 7 is not committed.
