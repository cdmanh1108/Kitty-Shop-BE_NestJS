# AI / coding agent instructions

Read these files before making architectural changes:

1. `.ai/00-project-context.md`
2. `.ai/01-architecture-rules.md`
3. `.ai/02-domain-invariants.md`
4. `.ai/03-change-checklist.md`
5. `docs/DATABASE.md`

Non-negotiable rules:

- preserve Product → ProductVariant → InventoryItem separation.
- preserve RentalOrderItem → RentalItemAllocation separation.
- never implement booking safety only as an application SELECT; keep DB overlap protection.
- deposits are not revenue.
- do not hard-delete financial/order history.
- controllers stay thin; business orchestration belongs in application services.
- application/domain must not import API DTOs; controllers map validated transport DTOs into application-owned inputs.
- repository ports use explicit typed results and inputs, with no `unknown` escape hatch or transport pagination dependency.
- application/domain layers must not issue Prisma queries directly.
- application audit calls depend on AUDIT_PORT, not concrete AuditService; preserve explicit best-effort semantics.
- keep required outbox and idempotency completion inside the business transaction; never recover stale claims without ownership fencing. See docs/RELIABILITY.md for deployment constraints.
- business statuses belong to their feature/domain; reuse canonical vocabularies instead of a generic common status type.
- preserve existing Decimal/string versus computed-number API semantics and rounding; see `docs/BUSINESS_TYPES.md`.
- use Clock for tested business-time decisions, not mechanically for all timestamps.
- keep Prisma payload types inside infrastructure; extract meaningful persistence mapping, not identity wrappers.
- split persistence by aggregate/responsibility, not mechanically by database table; pass the same transaction client into all helpers participating in an atomic write.
- client-supplied `shopId` is never authorization; use authenticated membership.
- new API input must use validation DTOs and Swagger metadata.
- new schema changes require committed migration + schema update + docs when invariants change.
- run `npm run quality` and `npm run openapi:export` before considering a contract change complete.

When uncertain, prefer a small explicit module/port over cross-module imports or shared god-services.

## Authentication invariants

- Never persist plaintext refresh tokens or log passwords, tokens, or Authorization headers.
- Refresh consumption and replacement persistence must share one transaction; concurrent reuse has one winner.
- Do not revoke a token family on an ambiguous concurrent refresh; see docs/AUTH_SECURITY.md.
- Login and refresh require their dedicated stricter limits relative to general defaults.
- Derive tenant/actor from authenticated membership; 401 is authentication failure, 403 is permission denial.

## Configuration and error handling invariants

- Application/domain must not read `process.env` directly; access configuration via typed `ConfigService`.
- Production startup must fail fast for missing or invalid critical secrets, TTLs, or configuration.
- Unknown internal errors must never expose raw messages, stacks, or causes to API clients in production.
- Prisma errors must be translated to safe domain/HTTP errors or sanitized to generic 500 responses.
- Swagger HTTP exposure is configuration-controlled and disabled by default in production.
- Never log tokens, passwords, Authorization headers, database URLs with credentials, or secret configuration.

## Testing invariants

- Use unit tests for pure/application behavior.
- Use PostgreSQL integration tests for Prisma constraints, transactions, and concurrency.
- Never use unsafe casts in test fixtures.
- Time-dependent business tests must use Clock/fixed time.
- Destructive test DB cleanup must refuse to run outside test environment.
- Prefer critical behavior coverage over raw coverage percentage.

Testing setup and actual suite boundaries: see docs/TESTING.md. Never use DATABASE_URL as fallback for destructive tests; use the owned, explicitly guarded TEST_DATABASE_URL client.

## Current boundary references

- Inventory operational condition is separate from occupancy. Unreleased allocation states own occupancy; elapsed dates do not release an ACTIVE rental. Archive and rate constraints: `docs/DATABASE.md`.
- Media storage keys are canonical for managed objects; retain external legacy sources and derive serving URLs through the injected resolver. CLI import is outside HTTP runtime: `docs/OBJECT_STORAGE.md`, `docs/LEGACY_CATALOG_IMPORT.md`.
- After a clean install, run `npm run db:generate` before checks. Run real PostgreSQL suites for transaction/concurrency changes: `docs/TESTING.md`.
- Export OpenAPI in BE, then run `npm run api:sync` and `npm run api:check` in FE. Never edit generated artifacts manually. FE integration status is in `../kitty-admin-fe/docs/API_MIGRATION.md`.
