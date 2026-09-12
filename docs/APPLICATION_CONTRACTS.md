# Application boundaries and typed contracts

## Dependency direction

`API → Application → Domain ← Infrastructure`

Controllers retain their validation/Swagger DTOs and use API-local `*.mapper.ts` functions to create plain application inputs. Services import `application/*.contracts.ts`, never API DTOs. These are plain interfaces/types, not decorated classes. Existing Nest DI, scheduling and application HTTP exceptions remain; domain contracts do not import Nest, Prisma or transport modules.

The affected services are Auth, Rentals, Catalog, Customers, Finance, Deliveries, Members, Reports and Settings. Audit, Dashboard and Reminders already had independent application inputs; only their untyped repository outputs needed correction. Health had no violation and remains unchanged.

## Inputs and read models

- Application contracts retain existing ISO strings and validated defaults. Date conversion/business checks stay where they previously ran. Catalog reuses existing domain write shapes when identical. Auth reuses `CurrentUser` for its session identity.
- Larger repository input objects have named criteria/data types. Each repository remains explicit; no generic base repository or command bus was introduced.
- `domain/*.records.ts` owns scalar read fields actually returned by current queries. `*.models.ts` composes those records with the specific selected relations for list/detail/write results. These are read contracts, not new behavioral aggregates or generated Prisma aliases. Cross-module relations import the owning module's scalar records.
- Create/detail representations intentionally differ where current includes differ (for example Catalog product creation versus product detail, or Member list versus member creation). Nullability matches `findFirst/findUnique` and existing conditional returns. A result alias may include `null`; application services preserve existing not-found handling.
- Reports SQL rows explicitly type the selected columns: revenue day is Date; monetary SQL `::text` fields are strings; `::int` counts are numbers. SQL and joins are unchanged.

Repository consumers now receive named models instead of `unknown`. Implementations continue to `implements` their ports, so compiler checking covers actual inferred Prisma results against independent contracts. No query or transaction split was needed.

## Pagination

`common/dto/pagination.query.dto.ts` contains only transport validation/defaults. `common/types/pagination.ts` owns `PaginationParams`, `PaginatedResult<T>` and the existing `paginateMeta` calculation. Repository/application code no longer imports transport pagination. Existing `{ items, meta: { page, limit, total, totalPages } }`, defaults and zero total-pages behavior remain unchanged.

## JSON, decimals and idempotency

`DecimalValue` exposes only the existing lossless `toString/toJSON` read capability. Infrastructure still returns the original decimal object; JSON still serializes it as a string. Existing calculations using `Number(...)` were not changed. This is a narrow structural boundary, not a new Money implementation.

`JsonValue` describes intentionally dynamic JSON fields. Object members can be absent/undefined, matching optional JSON properties and existing JSON serialization. Settings values, audit documents, and record metadata/pricing snapshots retain their actual free-form shape. Audit inputs use `AuditSnapshot` with JSON-compatible values; application inputs are copied into snapshot objects rather than typed as generic `object`. The best-effort AuditPort now enriches request metadata and sanitizes persisted snapshots; see [RELIABILITY.md](RELIABILITY.md).

`IdempotencyClaim` is discriminated by state. Completed rental claims carry `JsonSerialized<RentalOrderDetails>`; other states carry no response. Live order results may contain Date/Decimal; replay results already contain JSON strings. Both paths preserve the original serialized response, including a possible null result.

There is one narrow assertion at the persisted replay boundary in `rental-idempotency.claimIdempotency`: that scope is written by `createOrder` from `JSON.stringify(getWithTx(...))`. It does not validate externally edited/legacy malformed database JSON; adding a versioned replay schema is a separate idempotency task. No result is cast merely to hide a repository mapper mismatch, and no `as unknown as`/`any` was introduced.

Rental DTO mapping uses spread plus nested copies to preserve property order and defaults: the existing request hash uses `JSON.stringify(input)`. Tests compare the exact serialized bytes, not just object equality. Controllers continue returning application values without new response filtering or serialization.

## Compatibility and checks

Endpoint paths, HTTP methods, permissions, request validation, response fields, date/money semantics, database schema and transaction behavior are preserved. Settings' transport `value` type now names JSON while keeping the same validator/Swagger metadata. OpenAPI export is compared with the committed snapshot.

`test/application-boundaries.spec.ts` covers DTO defaults/nested copies, idempotency bytes/replay, query timezone/tenant mapping, report response preservation, errors and pagination. A TypeScript AST test prevents API/Prisma/decorator imports and untyped contracts in application/domain modules.

Current repository decomposition, domain vocabularies and PostgreSQL integration/E2E coverage are documented in ARCHITECTURE.md, BUSINESS_TYPES.md and TESTING.md. Money precision redesign and versioned idempotency replay schemas remain separate work.
