# Backend testing

## Suite responsibilities

- `npm test` / `npm run test:unit`: domain/application, architecture, security HTTP tests with mocked persistence, configuration and error handling. No database required. Unit workers are bounded to two; existing tests stay in place.
- `npm run test:integration`: real Prisma/PostgreSQL constraints, transactions, queries, concurrency and audit/outbox persistence. Runs serially.
- `npm run test:e2e`: real Nest routes, JWT/permissions/validation/filter and PostgreSQL. Runs serially.
- `npm run test:all`: unit, integration, then E2E. Explicit test database required.
- `npm run test:cov`: all three layers, serially, with coverage. No artificial threshold; inspect critical command/repository gaps.

`jest.config.cjs` retains the existing Jest setup. `jest.db.config.cjs` adds explicit test environment initialization before application imports and a 15-second per-test timeout. There is no forceExit or arbitrary concurrency sleep. DB-dependent tests fail if their environment is missing; they are never silently skipped. Integration/E2E runs must be serial across suites; do not launch both simultaneously against the same database.

The existing `quality` command still runs lint, the database-free default tests, build and OpenAPI export. It does not imply DB coverage. CI must run integration/E2E explicitly with an isolated migrated PostgreSQL database.

## Isolated PostgreSQL setup

Use a disposable database, never the application's development/production database. With Docker available, this optional local command uses the existing PostgreSQL 17 image and no persistent volume:

```powershell
docker run --detach --rm --name kitty-testing-p0 --publish 127.0.0.1:55432:5432 --env POSTGRES_DB=kitty_test --env POSTGRES_USER=kitty_test --env POSTGRES_PASSWORD=kitty_test_local_only postgres:17-alpine
$env:TEST_DATABASE_URL='postgresql://kitty_test:kitty_test_local_only@127.0.0.1:55432/kitty_test?schema=public'
npm run test:db:migrate
npm run test:integration
npm run test:e2e
# After testing, stop only the disposable container created above:
docker stop kitty-testing-p0
```

These are local test credentials, never production defaults. Wait until PostgreSQL is ready before running migration. Existing PostgreSQL infrastructure is equally suitable if it provides a dedicated test database. No new Docker orchestration or CI workflow is required.

`test:db:migrate` runs actual committed `prisma migrate deploy` migrations using TEST_DATABASE_URL explicitly. It does not seed users, reset databases or fall back to DATABASE_URL. Prisma CLI may print that `.env` was loaded; the explicitly supplied DATABASE_URL takes precedence. Missing test URL fails before connecting.

## Database safety and lifecycle

`test/helpers/test-database.ts` requires NODE_ENV=test and an explicit PostgreSQL URL naming `test_*` or `*_test`, with public schema. It rejects misleading names such as `contest`, target overrides and arbitrary clients. Before truncation it checks current_database/current_schema against the owned connection; it never trusts a separately supplied Prisma client just because an environment variable looks safe.

A dedicated one-connection Prisma client holds a PostgreSQL advisory session lock for the suite. A second process targeting the same DB fails instead of resetting another suite's fixtures. The test Prisma client retains multiple connections for real concurrent transactions. Do not put a transaction-pooling proxy between tests and PostgreSQL because the lease requires session affinity.

Each suite connects once, truncates public tables (excluding `_prisma_migrations`) between tests, and disconnects both clients on teardown. Table identifiers from PostgreSQL are escaped. Temporary outbox CHECK constraints used for failure injection are removed in finally blocks. The schema and exclusion constraints come from migrations, not simplified mock tables.

## Fixtures, clocks and application setup

Explicit fixtures create shops, users/members, customers and product/variant/inventory aggregates. Unique codes use a counter; password fixtures use a verified bcrypt cost-12 hash. Requested fixture permissions are honored. `rental.fixture.ts` supplies a cohesive booking scenario and fixed Clock, not a generic fake database.

Business periods and payment dates are fixed. Auth token expiry uses real protocol time; the expired-token scenario persists a date in the past. Tests do not sleep to arrange races: separate concurrent Prisma operations execute with Promise.all/Promise.allSettled, and assertions verify committed state.

E2E uses AppModule and the shared `configureApplication` bootstrap for middleware, prefix, ValidationPipe and exception filter. Test initialization supplies explicit non-production configuration and signing key. ConfigModule does not load `.env` in NODE_ENV=test. The scheduler's existing options provider is overridden before initialization, and the helper asserts that no cron jobs were registered. No test hooks were added to business behavior.

## Critical coverage matrix

| Area | Verified behavior |
| --- | --- |
| Rentals | Application validation/not-found/state decisions; real create, reschedule and lifecycle writes |
| Overlap | Half-open adjacent boundaries accepted, overlapping intervals denied by availability query and PostgreSQL exclusion constraint |
| Concurrency | Conflicting booking has one winner; concurrent confirmation/completion has one winner and one rental-count increment |
| Transactions/outbox | Allocation failure rolls back rental writes; forced outbox failure rolls back rental + idempotency completion or payment + payment state |
| Payments | Partial/full/void state, deposit held/refund ceiling; revenue SQL excludes deposits and voided records |
| Idempotency | Replay, payload mismatch, tenant-separated keys, concurrent same-key one mutation, fresh/stale lease and stale owner's release fencing |
| Auth | Real login/rotation/logout; concurrent refresh one winner, hash-only storage, expired token rejection and rollback on replacement insertion failure |
| Tenant | Rental/payment/catalog/customer reads/lists/writes scoped; HTTP cross-shop read/update denied and injected shopId rejected |
| Audit | Persisted actor/shop/request correlation, one audit on replay; existing best-effort failure and sanitization regression tests retained |
| HTTP security | 400/401/403/429, valid permissions, token response hygiene, health public, rental create/replay/overlap |
| Configuration/errors | Existing invalid config and production unknown-error sanitization tests retained |

Outbox has no dispatcher/consumer, so there are no invented delivery/exactly-once tests. Financial endpoints currently do not implement idempotency; no unsupported guarantee was added. Meaningful remaining expansion areas are delivery transitions, dashboard queries, product/customer performance reports, and refresh versus password-change session revocation races.

## Changes from the unfinished implementation

Retained Gemini's useful application and PostgreSQL test cases. Fixed unsafe implicit database selection, weak name matching, unowned-client cleanup, developer-config/secret inheritance, scheduler activation, unused permission options and timestamp-based fixture codes. Replaced broad untyped mock declarations with typed port functions. Added missing real rollback/concurrency/persistence/HTTP cases.

Small production testability changes: RentalService receives the existing Clock explicitly for idempotency expiry; HTTP bootstrap is shared; test-mode config skips `.env`. A real regression test exposed customer name search matching every phone when the normalized query was empty. The repository now adds the phone predicate only for a nonempty digit query; name/code search and tenant filters remain intact. No endpoints, migrations or dependencies changed. Existing formatting cleanup from the unfinished working tree was preserved.

## Quality gates for Task 8

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:db:migrate
npm run test:integration
npm run test:e2e
npm run test:cov
npm run build
npx prisma validate
npm run openapi:export
npm run format:check
```

CI should provide TEST_DATABASE_URL, create an isolated PostgreSQL database, apply migrations, and execute the suites sequentially. CI implementation and maintenance jobs remain out of scope.

## Verified result (2026-09-11)

PostgreSQL 17 disposable container with both committed migrations: 214 unit/component tests, 24 integration tests, and 9 E2E tests passed (247 total across 26 suites). Combined coverage: 77.8% statements, 61.3% branches, 78.7% lines. Coverage is a diagnostic, not a correctness claim. Typecheck, lint, build, Prisma validate, OpenAPI export (unchanged contract), and full format check passed. The disposable container is stopped after verification.

## Rental/inventory occupancy audit (2026-09-11)

Verified on an isolated PostgreSQL 17 container with all four migrations:
322 unit/component tests, 39 integration tests, and 9 E2E tests passed.
`quality` (lint, unit, build, OpenAPI export), standalone typecheck and lint passed.
OpenAPI output is unchanged. Full formatting was run; unrelated formatting changes
were reverted to keep this repair scoped.

Regression coverage includes booking versus CLEANING/REPAIRING/DAMAGED/LOST/RETIRED
and archive, expired unreleased reservations, overdue ACTIVE occupancy, activation
and rescheduling against another active rental, cleaning completion between booked
orders, distinct dashboard occupancy, and operational-status CHECK enforcement.
The migration test reconstructs the previous inventory schema within a rollback-only
transaction, applies the actual repair SQL, and verifies legacy normalization plus
allocation/history preservation. Clean-database migrate deploy also passed.

Prisma Client generation passed using the same schema with an isolated output path.
The normal output command was blocked by Windows EPERM replacing the in-use engine
DLL, including outside the sandbox; no development process was stopped. Only schema
comments changed, so there is no generated-client type change in this task.

## Catalog integrity audit (2026-09-11)

Verified against an isolated PostgreSQL 17 database using all five migrations:
322 unit/component tests, 61 integration tests, and 9 E2E tests passed.
Lint, typecheck, build, quality, OpenAPI export, Prisma validate and diff-check
passed. OpenAPI is unchanged. Formatting was run, retaining changes only in scope.

`catalog-invariants.integration.spec.ts` adds real database regression coverage for:

- Unreleased HELD/CONFIRMED/ACTIVE archive guards including overdue allocations;
  cancelled/returned allocations permit archive without deleting history.
- Booking versus product/inventory archive has one winner; stale selected inventory
  cannot be booked after product archive. Cross-shop archive/rate writes are denied.
- Concurrent rate creation and update both return one canonical active row.
- Direct duplicate active rates are rejected for both NULL product-level scope and
  variant scope; different durations, variants and inactive history coexist.
- Variant override versus product fallback pricing, nullable variant combinations,
  concurrent variant additions, and primary-media uniqueness under concurrent writes.
- The actual new migration runs from the prior schema reconstructed in a rollback
  transaction. Duplicate variant/product rates, variant combinations and primary
  media fail its preflight with no partial migration or data rewrite.

Archive correctness uses the repository Serializable protocol, not a cross-table
SQL trigger. Direct/import uniqueness is enforced by SQL indexes. CLI imports retain
their per-product transaction and may report conflict rather than silently merge
competing prices or physical identities. Production duplicate data must be reconciled
before deploying migration 202609110004; tests do not assert that production is clean.
