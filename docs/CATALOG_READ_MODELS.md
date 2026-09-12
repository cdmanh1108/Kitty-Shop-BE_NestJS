# Catalog read models — Task 4

## Consumer audit

The audit followed actual frontend render code before choosing projections.

| Consumer                   | Previous path                                          | Fields needed                                                                                                   |
| -------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Products list              | `/products`, mapped through detail/compatibility model | Identity, category name, primary image, status, deposit, size/color labels, price range                         |
| Product detail             | `/products/:id`                                        | Product metadata, gallery, variants, rates, inventory counts                                                    |
| Product editor             | `/products/:id` raw DTO                                | Editable fields, stable variant IDs, rate durations/prices, inventory counts                                    |
| Inventory product selector | `/products?limit=200`, eagerly fetched                 | Product identity and small variant identity/size/color options                                                  |
| Categories                 | Lookups plus first 200 products                        | Category metadata and accurate product count; sizes/colors                                                      |
| Inventory list             | `/inventory` with full nested records                  | SKU, product/variant labels, operational condition, occupancy, allowed transitions, current rental, update time |
| Inventory drawer           | `/inventory/:id`                                       | Item condition/location/notes, variant rates, current rental, status history                                    |
| Inventory cards            | Reduce `/inventory?limit=200`                          | Global shop counts of operational conditions and occupied physical items                                        |
| Recent inventory history   | Flatten nonexistent list `statusHistory`               | Actual history, SKU, product name, transition, reason, timestamp                                                |
| Global product search      | Filter first 200 products in browser                   | Product identity and bounded server search                                                                      |

The old `limit=200` requests also exceeded the current backend maximum of 100. They were neither a valid full dataset contract nor a reliable summary source.

## Final contracts

Paths below omit `/api/v1`.

| Use case                       | Endpoint                 | Response                                                  |
| ------------------------------ | ------------------------ | --------------------------------------------------------- |
| Product list                   | `GET /products`          | `ProductPageResDto<ProductListItemResDto>`                |
| Product detail/editor          | `GET /products/:id`      | Existing `ProductResDto`                                  |
| Product selector/search        | `GET /products/lookup`   | `ProductLookupPageResDto`                                 |
| Category counts/reference data | `GET /catalog/lookups`   | `CatalogLookupsResDto`, categories include `productCount` |
| Inventory list                 | `GET /inventory`         | `InventoryPageResDto<InventoryListItemResDto>`            |
| Inventory detail               | `GET /inventory/:id`     | `InventoryItemResDto`                                     |
| Inventory cards                | `GET /inventory/summary` | `InventorySummaryResDto`                                  |
| Inventory history              | `GET /inventory/history` | `InventoryHistoryPageResDto`                              |

Lists retain server pagination/filtering, maximum 100 rows and DB totals. Product lookup supports page, limit (maximum 50), search by code/name, status, category and exact product ID. Without status filtering, both active and inactive unarchived products are included, preserving warehouse selector behavior. Exact ID supports preselection outside the first page. History supports page/limit (maximum 100), product and inventory-item filters, newest first with ID tie-breaking. History includes archived items so retirement does not erase operational history.

All queries derive the shop from the authenticated principal. Static routes precede `/:id` routes. Controller DTOs validate inputs and map them to application/domain contracts; Prisma remains inside infrastructure.

## Query and payload changes

| Read              | Before                                                                                  | After                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Product list      | Full product scalars, category, variant size/color records, rate collections and counts | Explicit scalar/label selects, one primary image, only variant size/color names; one batch `rentalRate.groupBy(productId)` for page min/max |
| Lookup            | Same large product list                                                                 | Five top-level fields; variants contain only ID, code, size/color names                                                                     |
| Categories        | Full reference records and browser product grouping                                     | Small reference selects plus filtered `_count.products` across all unarchived shop products                                                 |
| Inventory list    | Full item, variant, product, location and allocation records                            | Explicit list selects and at most one relevant allocation with small order summary; no history, rates, gallery or location fetch            |
| Inventory detail  | Also fetched unused service records                                                     | Existing detail retained; unused service-record collection removed                                                                          |
| Inventory summary | Browser reduction of a limited/invalid list                                             | DB `groupBy(currentStatus)` plus distinct physical-item `count` with allocation `some` predicate                                            |
| Recent history    | List response with no history field                                                     | Bounded `inventoryStatusHistory.findMany` and DB count, joining only SKU and product name                                                   |

Product list has 13 top-level fields and exposes no variant/rate/gallery collections. Missing price/image stays null; zero remains zero. The price range preserves the list's range over active product/variant rates, excluding archived variants; it is not a quote for a particular duration and does not invent multi-day pricing. Decimal values retain string serialization.

No per-row SQL or HTTP loop was added. Price aggregation is once per page; relation loading remains Prisma's batched loading. Image URLs are constructed locally without storage network calls. No new tables, indexes, dependencies or rental transaction changes were needed. Payload bytes and production latency were not measured; the evidence is the query/field changes and regression tests, not an invented speedup.

Inventory cards remain **global to the shop**, independent of list filters, matching the previous intended behavior. `available` counts operational AVAILABLE; `occupied` counts items with unreleased HELD/CONFIRMED/ACTIVE allocations, including overdue ACTIVE rentals. These dimensions can overlap. `needsAttention` is CLEANING + REPAIRING + DAMAGED + LOST. Summary uses the same canonical allocation predicate as warehouse reads. Product/category filters now combine instead of overwriting each other, and inventory search includes product code.

## Frontend requests and cache

Cold-cache counts below are derived from consumer calls and verified with mocked API spies; they exclude authentication, mock Order/Customer requests, retries and image downloads.

| Screen/action           | Before                                                                            | After                                                                            |
| ----------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Products                | List + catalog lookups; global search additionally eager-loads large product list | List + shared catalog lookup (2); global product search waits for input          |
| Inventory, modal closed | Inventory list + attempted bulk list + eager product list (3)                     | Inventory list + summary + real recent history (3); zero product lookup requests |
| Open inventory modal    | Already fetched eagerly                                                           | One bounded lookup, or zero if matching cache is fresh                           |
| Categories              | Catalog lookups + attempted bulk product list (2)                                 | Shared catalog lookup with counts (1)                                            |
| Search/page lookup      | Client filters initial subset                                                     | One bounded server request for each new uncached query/page                      |

Product lookup keys normalize filters/defaults and share a five-minute stale time. Category selectors and the category screen share the same catalog lookup cache. Inventory list keys capture normalized immutable request parameters. Product mutation invalidation adds lookup and category counts to the existing fan-out. Inventory mutation invalidation is centralized for list/detail/summary/history and product detail; archive uses the cached product ID, with product-details prefix fallback if identity is unavailable. No global cache clear is used.

The real Product list uses a small list mapper; editor queries preserve raw generated DTOs. Global Search uses server Product lookup. Orders/Calendar use the separate `useMockOrderCatalog` hook through `mock-services.ts`. Real Product detail does not join mock rental history or fabricate compatibility pricing. See the frontend API_MIGRATION.md for current migration status.

## Files and verification

- `domain/catalog.read-models.ts`, `catalog.models.ts`, `catalog.repository.ts`: explicit projections and typed ports.
- `application/catalog.service.ts`, `api/catalog.controller.ts`, `catalog.dto.ts`, `catalog-read.dto.ts`: use cases, validated routes and Swagger contracts.
- `infrastructure/product-queries.ts`, `catalog-lookups.ts`, `inventory-persistence.ts`, `inventory-read-queries.ts`, `prisma-catalog.repository.ts`: selects, aggregation and scoped persistence.
- `test/integration/catalog-read-models.integration.spec.ts`: >200 counts, pagination, nullable/zero prices, bounds, shop isolation, history order, combined filters, one batch price query and summary without inventory-list reads.
- `test/e2e/catalog-reads.e2e.spec.ts`: static routing, authentication, permissions, pagination validation and rejected tenant injection.
- Existing catalog unit fixtures updated for the explicit port additions.
- Frontend product/inventory API wrappers, keys, query hooks, mappers and screens consume the corresponding projections. `app/query/invalidation.ts` owns fan-out; `api/services.ts` isolates remaining mock compatibility.
- Frontend `read-models.test.tsx` covers modal lazy loading/cache reuse/search/preselection, backend category counts, paginated product requests, summary/history rendering, normalized request snapshots and targeted invalidation. Task 3 regression tests remain enabled.

Contract changes: product/inventory list shapes are intentionally narrowed and require coordinated BE/FE deployment. Lookup, summary and history endpoints are additive; category `productCount` is additive. Product detail/editor contract is retained. OpenAPI is exported from backend and synced/generated by frontend scripts; generated artifacts are never edited by hand. Backend `generated/openapi.json` remains ignored according to repository convention; the frontend snapshot and TypeScript schema are committed.

Validation commands: BE `typecheck`, `quality` (lint, 322 unit tests, build, OpenAPI), isolated PostgreSQL integration (65 tests) and E2E (10 tests); FE `check` (API check, typecheck, lint, 252 tests, build). Database tests use a disposable PostgreSQL 17 database with all five migrations, never the development database.

## Classification and limits

- **Correctness/scalability:** full-dataset counts, valid bounded lookup, actual history reads, combined filters and scoped cache invalidation.
- **Performance evidence:** smaller explicit projections and elimination of eager product lookup; no production timing or byte measurements claimed.
- **Future bottleneck:** lookup variant labels scale with variants per selected product; history and aggregate counts still depend on DB workload. No speculative indexes were added without query-plan evidence.
- **Micro-optimizations:** not pursued.

Live deployment/browser behavior is not a substitute for the mocked frontend tests. Coordinate list-contract rollout between clients and server. Inventory history requires `inventory.view`, including when shown on Product Detail; denied reads render an error instead of invented empty history. Current operational/occupancy card overlap is intentional, not a total partition.
