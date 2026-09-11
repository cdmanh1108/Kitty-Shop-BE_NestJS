# Architecture

## Style

This repository uses a pragmatic Clean Architecture per business module. It deliberately avoids a giant global `services/` or `repositories/` folder.

```text
HTTP
 ↓
api/controller + request DTO
 ↓
application/use-case service
 ↓
domain repository port
 ↑
infrastructure/Prisma repository
 ↓
PostgreSQL
```

Allowed dependency direction:

- `api` may import `application`, `domain` types, and `common`.
- `application` may import `domain` and `common`.
- `domain` must not import NestJS, Prisma, HTTP DTOs or infrastructure.
- `infrastructure` implements domain ports and may import Prisma/external SDKs.
- Modules communicate through exported application services or explicit ports, never by reaching into another module's Prisma repository.

The current repository is intentionally pragmatic rather than “pure DDD”: Prisma models are returned from infrastructure where a separate domain entity adds no value, while important business boundaries are still protected by ports and use-case services.

Application services consume plain `application/*.contracts.ts` inputs mapped by the API, never transport DTOs. Repository ports expose independent records/read models from `domain/*.records.ts` and `*.models.ts`. Generic pagination is transport-independent. See [Application contracts](APPLICATION_CONTRACTS.md) for ownership, JSON/Decimal compatibility and idempotency replay semantics.

## Modules

- `auth`: login, access JWT, refresh token rotation/revocation.
- `members`: admin users and shop roles.
- `customers`: customer CRUD/search and internal notes.
- `catalog`: categories/sizes/colors, products, variants, physical inventory, rental rates and availability.
- `rentals`: order lifecycle, pricing snapshots, allocations, charges, calendar querying and idempotency.
- `finance`: money movements and expenses; recomputes order payment/deposit state.
- `deliveries`: outbound and return delivery jobs.
- `reminders`: derived operational reminders and scheduled refresh.
- `dashboard`: operational read model.
- `reports`: aggregate read models.
- `settings`: shop profile and extensible JSON settings.
- `audit`: immutable admin-change history.
- `health`: liveness/readiness endpoints.

## Cross-cutting concerns

### Authentication

Access tokens contain user/member/shop identity. `JwtAuthGuard` re-checks the active membership and resolves permissions from the database on each protected request. This favors immediate permission revocation and correctness over premature caching.

Refresh tokens are random opaque values; only SHA-256 hashes are stored. Refreshing rotates the token and revokes the previous record.

### Authorization

Controllers declare permission requirements through `@Permissions(...)`. `PermissionsGuard` compares them against the current membership's resolved permission set.

Do not trust a `shopId` sent by the client. The active tenant comes from `CurrentUser.shopId`.

### Validation / errors

Global `ValidationPipe` enables whitelist + forbid-non-whitelisted input. `AllExceptionsFilter` produces a consistent error shape and translates common Prisma unique/not-found errors without leaking DB details.

### Idempotency

Rental creation accepts `Idempotency-Key`. A completed request can be replayed safely. A reused key with a different request hash is rejected.

### Concurrency

The service checks availability for a friendly error, but the database owns the final guarantee. `rental_item_allocations` has a GiST exclusion constraint on active intervals. Never remove this and rely only on a pre-insert SELECT.

### Audit

Important create/update/transition actions write audit records. Do not store secrets, passwords, refresh tokens or full authentication payloads in audit JSON.

### Outbox

`outbox_events` is present so DB state changes and future side effects (Zalo/SMS/webhooks/search sync) can be committed atomically. Current admin logic does not depend on an external broker. When adding integrations, implement a retrying dispatcher rather than sending network requests inside the order transaction.

Audit/request context, transactional side-effect inventory and fenced claim recovery are
documented in [RELIABILITY.md](RELIABILITY.md). AuditPort remains best-effort; required
business histories/outbox remain transactional.

## Extending the system

Business vocabulary, money serialization, scoped Clock usage and reference-number
compatibility are documented in [BUSINESS_TYPES.md](BUSINESS_TYPES.md).

### Prisma persistence responsibilities

Rental and Catalog ports remain unchanged. Their injectable Prisma adapters forward to
infrastructure-local functions, using the existing PrismaService; no additional clients
or providers are created.

- Rentals: `rental-queries` owns reads and the shared transaction-aware detail loader;
  `rental-availability` owns bookable variant lookup; `rental-prisma.mapper` owns its
  typed include and Decimal/nullable mapping. `rental-booking` owns creation;
  `rental-idempotency` owns claim/recovery/transactional completion; `rental-lifecycle` owns transitions, rescheduling and charges.
- Catalog: `product-queries` owns product reads; `product-commands` owns product,
  variant/rate and media aggregate writes. Its variant creation helper receives the
  caller's transaction. `inventory-persistence` owns inventory reads/state/history;
  `catalog-lookups` owns catalog reference data.
- `catalog/infrastructure/inventory-availability` owns the shared inventory filter
  used by Catalog and Rentals infrastructure. Intervals remain half-open, and the
  database exclusion constraint remains the final protection against overlaps.

Creation/rescheduling retain the existing Serializable transaction/retry helper and
overlap error translation. Lifecycle, charge, product/media and inventory operations
retain their original transaction boundaries. Rental detail loading, outbox writes
and completed idempotency responses use the same transaction as their owning write.
Idempotency claim/release remain separate operations as before.

Prisma payload types stay in infrastructure. Read results that already structurally
satisfy the inner contracts pass through without identity mappers: Decimal, Date,
JSON, nullability and nested relations retain their existing runtime representation.
List includes, filters, sorting, pagination and query counts are preserved; this is
an organizational refactor, not a performance optimization.

`test/persistence-boundaries.spec.ts` covers mapping, availability and selected
adapter contracts using pure fixtures/delegate spies without connecting to a database.
It does not establish PostgreSQL rollback or concurrent exclusion behavior; the
repository currently has no integration/e2e database harness.

For a new feature `foo`:

```text
src/modules/foo/
  api/foo.controller.ts
  api/foo.dto.ts
  application/foo.service.ts
  domain/foo.repository.ts
  infrastructure/prisma-foo.repository.ts
  foo.module.ts
```

Create a domain port before embedding Prisma calls in application logic. Keep controller methods thin. Transactions belong in the repository/transaction boundary that owns the consistency invariant.

See [Authentication security](AUTH_SECURITY.md) for JWT/refresh guarantees, auth rate limits, production seed requirements and deployment limitations.
