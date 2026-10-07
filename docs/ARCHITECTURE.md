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

Repository ports expose explicit domain-owned records and read models. Prisma payload types remain inside infrastructure; application contracts do not depend on generated Prisma models. See [Application contracts](APPLICATION_CONTRACTS.md).

Cross-context imports use the provider's `public/` contracts; importing another
module's private `api`, `application`, `domain` or `infrastructure` layer is not
allowed. Transaction-aware persistence capabilities stay in provider infrastructure
and may be called only by infrastructure adapters with the caller's existing
transaction client. Domain and application ports never expose Prisma clients. Keep
cross-table read projections with the owning use case and document their intent;
write another context's tables through that context's capability. Nest module
imports are for composition, and `forwardRef()` is not a boundary mechanism.

### Cross-context dependency audit

The baseline source audit found these private-layer edges before CL27:

| Consumer | Providers reached through private layers |
|---|---|
| Catalog | Audit, Rentals, Settings |
| Customers | Audit |
| Dashboard | Rentals |
| Deliveries | Audit, Rentals |
| Favorites | Catalog |
| Finance | Audit, Rentals |
| Members | Audit |
| Reminders | Finance, Rentals |
| Rentals | Audit, Catalog, Customers, Deliveries, Finance, Settings |
| Settings | Audit |

The resulting source-level contract graph is:

| Consumer | Provider | Contract |
|---|---|---|
| Catalog | Audit | `AuditPort` |
| Catalog | Rentals | availability reader, rental status values |
| Customers | Audit | `AuditPort` |
| Dashboard | Rentals | rental and allocation status values |
| Deliveries | Audit | `AuditPort` |
| Deliveries | Rentals | order lock and shipping-charge capability |
| Favorites | Catalog | storefront catalog and eligibility contracts |
| Finance | Audit | `AuditPort`, transactional audit capability |
| Finance | Rentals | monetary policy and order lock |
| Members | Audit | audit port, entry data, transactional audit capability |
| Reminders | Finance | payment status values |
| Reminders | Rentals | rental status and rescheduling policy |
| Rentals | Audit | `AuditPort`, transactional audit capability |
| Rentals | Catalog | eligibility, status, inventory transaction capabilities |
| Rentals | Customers | booking customer and loyalty transaction capabilities |
| Rentals | Deliveries | delivery contract and transaction capabilities |
| Rentals | Finance | payment statuses/readers/receipt and payment-state capabilities |
| Rentals | Settings | rental policy |
| Settings | Audit | audit snapshot and `AuditPort` |

The public transaction helpers are infrastructure-only integration capabilities;
they receive the caller's transaction so existing atomic workflows stay intact.
Application/domain contracts do not expose Prisma. Catalog inventory projections
join Rental allocations and minimal order/customer details for display; Rental
queries also read payment and Catalog data for order views and availability. These
are intentional read models. Catalog owns inventory writes, Finance owns payment
writes, Deliveries owns delivery writes, Customers owns customer-loyalty entries
and reward records, and Rentals owns rental orders/charges and the settlement
reward calculation. Loyalty ownership follows `webAccountId` when present and
otherwise remains with the CRM customer; contact details never merge the scopes.
Finance's `recomputeOrderPaymentState` is the explicit exception for denormalized
payment/deposit fields on `RentalOrder`: Finance owns that projection and updates it
through a named transaction capability after payment changes.

Application services consume plain `application/*.contracts.ts` inputs mapped by the API, never transport DTOs. Repository ports expose independent records/read models from `domain/*.records.ts` and `*.models.ts`. Generic pagination is transport-independent. See [Application contracts](APPLICATION_CONTRACTS.md) for ownership, JSON/Decimal compatibility and idempotency replay semantics.

## Shop model

The current application and deployment model manages exactly one active Shop. Business data and repository queries remain scoped by `shopId` for ownership and data integrity; this does not make Kitty a multi-shop SaaS product.

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

Do not trust a `shopId` sent by the client. The active shop comes from `CurrentUser.shopId`.

### Validation / errors

Global `ValidationPipe` enables whitelist + forbid-non-whitelisted input. `AllExceptionsFilter` produces a consistent error shape, maps canonical domain errors (`RentalOverlapError`, `RentalClaimLostError`, `InvalidRentalIntervalError`, `FinanceInvariantError`, `CatalogInvariantError`), and sanitizes Prisma and unknown 500 errors in production without leaking DB queries, table details, or stack traces.

### Production configuration & hardening

Configuration is centralized and validated fail-fast at bootstrap. In production:

- `JWT_ACCESS_SECRET` requires at least 32 characters and rejects weak/placeholder values.
- `PORT`, `RATE_LIMIT_TTL_MS`, and `RATE_LIMIT_LIMIT` must be valid positive integers.
- `CORS_ORIGINS` wildcard `*` is prohibited when credentials are enabled.
- `SWAGGER_ENABLED` defaults to `false` in production (and `true` in development/test). Programmatic OpenAPI generation (`npm run openapi:export`) remains independent and DB-free.
- Startup failures log sanitized messages and exit with non-zero status.

### Idempotency

Rental creation accepts `Idempotency-Key`. A completed request can be replayed safely. A reused key with a different request hash is rejected.

### Concurrency

The service checks availability for a friendly error, but the database owns the final guarantee. `rental_item_allocations` has a GiST exclusion constraint on active intervals. Never remove this and rely only on a pre-insert SELECT.

### Inventory Operational Condition vs Rental Occupancy

- **Physical Inventory (`inventory_items`)**: Models physical identity and operational condition (`AVAILABLE`, `CLEANING`, `REPAIRING`, `DAMAGED`, `LOST`, `RETIRED`). Enforced by PostgreSQL CHECK constraint `inventory_items_operational_status_check`.
- **Rental Occupancy (`rental_item_allocations`)**: Sole canonical source of truth for rental reservations and occupancy (`HELD`, `CONFIRMED`, `ACTIVE`, `RETURNED`, `CANCELLED`). The rental lifecycle never persists redundant `RENTED` or `RESERVED` statuses on `InventoryItem`.
- **Atomic Availability**: Booking occurs inside a `Serializable` transaction where candidate items are re-validated for operational condition (`AVAILABLE`) and absence of active/unreleased allocations before allocation insert. Overlapping allocations are rejected by the database GiST exclusion constraint (`rental_item_no_overlap`).
- **Warehouse Safety**: Operational transitions on inventory (`AVAILABLE` -> `CLEANING`, `DAMAGED`, etc.) run inside a transaction and reject modifications if an active/unreleased allocation (`HELD`, `CONFIRMED`, `ACTIVE`) exists.
- **Overdue Protection**: An overdue rental whose allocation remains `ACTIVE` with `releasedAt === null` continues to block availability regardless of `rentalEndAt < now`.

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

- Rentals: `rental-admin.queries` owns admin rental-order reads and the shared
  transaction-aware detail loader; `rental-web-order.queries` owns storefront order
  lookup/account reads; `rental-creation-validation.queries` owns creation reference checks.
  `rental-availability` owns bookable variant and active-variant lookup; `rental-prisma.mapper` owns its
  typed include and Decimal/nullable mapping. `rental-booking` owns creation;
  `rental-idempotency` owns claim/recovery/transactional completion; `rental-lifecycle` owns transitions, rescheduling and charges.
- Catalog: `product-queries` owns admin product reads; `product-commands` owns product,
  variant/rate and media aggregate writes. Its variant creation helper receives the
  caller's transaction. `inventory-commands` owns inventory mutations; `inventory-queries`
  owns inventory lists, details, summary and history. Time-window availability is
  provided by the focused Rental reader;
  `catalog-lookups` owns catalog reference data.
- Catalog exposes Rental-only inventory mutation capabilities for rental start and
  return inspection. Rental booking and lifecycle retain their existing transaction
  while Catalog owns the inventory writes. Catalog inventory detail/list reads join
  Rental allocation and order/customer data as an intentional read projection.
- Rental booking and lifecycle call Delivery-owned transactional capabilities for
  delivery creation/cancellation. Delivery calls a Rental-owned capability for
  shipping-charge changes. Finance owns receipt persistence and payment-state
  projection helpers used by Rental in the same transaction.
- Rental availability owns the rentable-inventory filter. Intervals remain
  half-open, and the database exclusion constraint remains the final protection
  against overlaps.

Creation/rescheduling retain the existing Serializable transaction/retry helper and
overlap error translation. Lifecycle and warehouse mutations also use Serializable transactions. Charge and product/media operations retain their original transaction boundaries. Rental detail loading, outbox writes
and completed idempotency responses use the same transaction as their owning write.
Idempotency claim/release remain separate operations as before.

Prisma payload types stay in infrastructure. Read results that already structurally
satisfy the inner contracts pass through without identity mappers: Decimal, Date,
JSON, nullability and nested relations retain their existing runtime representation.
List includes, filters, sorting, pagination and query counts are preserved; this is
an organizational refactor, not a performance optimization.

`test/persistence-boundaries.spec.ts` covers mapping, availability and selected
adapter contracts using pure fixtures/delegate spies without connecting to a database.
It does not establish PostgreSQL rollback or concurrent exclusion behavior; real PostgreSQL coverage lives in test/integration and test/e2e (see TESTING.md).

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

Booking, rescheduling and handover validate physical rentability through
`rental-inventory.assertInventoryRentable` using the owning transaction client.
Warehouse commands read the same allocation predicates before writing inventory;
Serializable read/write conflict detection aborts and retries concurrent stale decisions.
The existing exclusion constraint remains responsible for overlapping reservations.
Exhausted serialization retries return HTTP 409 `CONCURRENT_MODIFICATION`.

Unreleased HELD/CONFIRMED allocations block warehouse removal regardless of their
end date; ACTIVE also blocks new bookings outside its planned interval. Completing
an active rental releases its allocations and sends the item to CLEANING, even when
another future reservation exists. Finishing CLEANING/REPAIRING to AVAILABLE is
allowed with reservations, but never while an ACTIVE rental remains. Handover
rechecks rentability so a scheduled order cannot start while cleaning is unfinished.
Inventory responses keep separate operational and occupancy fields. Dashboard
inventory totals count distinct physical items; ACTIVE takes precedence over future
reservations. The top-level currentlyRented KPI continues to count active allocations.

Catalog archive protection reuses `activeOccupyingAllocationWhere` for product and
inventory. It depends on allocations, not a second order-item status definition.
Rental transaction rentability includes the parent product and variant, closing
booking versus product archive races even when candidates were selected earlier.
The repository also guards internal updateProduct calls requesting ARCHIVED;
transport DTOs retain their existing allowed statuses.

Active rental-rate writes use a parameterized INSERT ON CONFLICT within the owning
Prisma transaction, targeting the SQL partial unique index. Both concurrent
upserts can succeed and return the same active row, with the last update winning.
Prisma still loads the returned record to preserve Decimal/date mapping. Variant
creation and primary-media replacement use Serializable transactions; unique
indexes remain the final protection for direct writes. Unique conflicts use the
existing sanitized 409 mapping. Competing inserts can fail the aggregate
transaction under these indexes rather than create duplicates.

## Storage and import boundaries

Catalog media reads use an injected public URL resolver and centrally validated storage configuration. Key-backed objects retain provider-neutral identity; external legacy URLs remain supported. See [Object storage](OBJECT_STORAGE.md).
