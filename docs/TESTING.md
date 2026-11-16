# Backend testing

## Gates

```bash
npm run db:generate
npm run typecheck
npm run format:check
npm run quality
```

`quality` runs lint, database-free unit tests, the production build,
production-entrypoint verification, and OpenAPI freshness checks. Run the
database suites when changing persistence, transactions, constraints, or HTTP
flows:

```bash
npm run test:db:migrate
npm run test:integration
npm run test:e2e
```

Integration and E2E suites run serially. Do not run them in parallel against the
same test database.

The integration suite includes `schema-drift.integration.spec.ts`: migrated
PostgreSQL must match Prisma-supported metadata with an empty read-only diff.
It uses only the explicitly guarded test database and checks the three
baseline-created trigram/OTP indexes. PostgreSQL-only partial/expression
indexes and exclusion/check constraints still need their own invariant tests
and migration review; an empty Prisma diff is not a complete database audit.

## Isolated PostgreSQL

Use a disposable database only. The database test helper requires an explicit
`TEST_DATABASE_URL` naming a dedicated test database and refuses to fall back to
the application `DATABASE_URL`. It verifies the database name and schema before
truncating fixtures. Never use a development, staging, or production database.

Example local container:

```powershell
docker run --detach --rm --name kitty-release-tests --publish 127.0.0.1:55432:5432 --env POSTGRES_DB=kitty_test --env POSTGRES_USER=kitty_test --env POSTGRES_PASSWORD=kitty_test_local postgres:17-alpine
$env:TEST_DATABASE_URL='postgresql://kitty_test:kitty_test_local@127.0.0.1:55432/kitty_test?schema=public'
npm run test:db:migrate
npm run test:integration
npm run test:e2e
docker stop kitty-release-tests
```

The test migration command applies the committed fresh-database baseline. It
does not seed, reset, or fall back to `DATABASE_URL`. Suite fixtures create the
needed records and clear their own database between tests.

## CI

`.github/workflows/ci.yml` is retained. Automatic `push` runs are commented out;
the workflow still runs for pull requests targeting `main` or `master` and by
manual `workflow_dispatch`. It provisions its own PostgreSQL service, applies
the baseline, seeds, runs quality, and executes integration tests. It does not
run E2E or coverage.

## Coverage focus

The database suites verify rental overlap protection, transactional rollback,
payment/deposit accounting, idempotency ownership, refresh-token rotation,
shop scoping, and audit/outbox persistence. Add coverage alongside changes to
those boundaries rather than weakening or bypassing the database constraints.

## Request-parser regression

`test/unit/request-parser.spec.ts` runs the real Nest parser and
`configureApplication` in isolated child processes without importing AppModule
or connecting to a database. It covers ordinary JSON/gzip bodies, trailing bytes
after a completed deflate frame and a larger invalid tail after a gzip frame,
followed by a health request. An unhandled parser error fails the child instead
of terminating Jest.

Production dependency versions and remaining advisory triage are documented in
[Dependency security](DEPENDENCY_SECURITY.md).
