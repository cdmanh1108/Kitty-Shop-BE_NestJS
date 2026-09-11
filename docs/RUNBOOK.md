# Runbook

## Reliability update deployment

Read [RELIABILITY.md](RELIABILITY.md) before enabling stale-claim recovery. Drain/stop all
old backend instances and in-flight rentals first; mixed old/new idempotency writers are
unsafe because old code does not fence claim ownership. Apply migration
202609110001_audit_request_id_text before new audit enrichment. No migration has been
applied automatically by this refactor.

## Local setup

```bash
npm run i
npm run bootstrap
npm run start:dev
```

`npm run i` only installs dependencies. Run `npm run bootstrap` separately to prepare the environment, apply migrations, seed data and export OpenAPI.

If Docker is not available, run PostgreSQL yourself, update `DATABASE_URL`, set `DB_AUTO_START=false`, then rerun `npm run bootstrap`.

## Production checklist

- use a managed PostgreSQL with backups/PITR.
- set a strong `JWT_ACCESS_SECRET` from a secret manager.
- change/remove default seed credentials.
- set `NODE_ENV=production`.
- set exact allowed `CORS_ORIGINS`; do not use `*` with credentials.
- set `TRUST_PROXY=true` only behind a trusted reverse proxy/load balancer.
- set `SWAGGER_ENABLED=false` if public production API docs are unwanted.
- run `npm run db:migrate` before rolling out application instances.
- run `npm run quality` in CI.
- collect structured application/container logs and PostgreSQL metrics.
- keep `LOG_LEVEL=log` to retain request/auth outcomes; configure log retention and access controls. See [Logging](LOGGING.md) for fields and redaction rules.
- alert on 5xx rate, DB connection exhaustion, migration failures and disk/storage growth.

## Backup and restore

Back up PostgreSQL, not the Prisma client. Test restore procedures regularly. Product media should be stored in object storage and backed up/versioned according to the provider policy; only keys/URLs belong in the database.

## Deployment order

For backward-compatible changes:

1. apply additive DB migration.
2. deploy compatible API.
3. deploy FE.
4. backfill asynchronously if needed.
5. remove legacy fields only in a later release.

## Incident: booking overlap

The database constraint should prevent active overlapping allocations. If an overlap is ever observed:

1. do not disable the exclusion constraint.
2. inspect allocation statuses and exact timestamps.
3. inspect any manual SQL/import path that bypassed migrations/constraints.
4. reconcile orders before changing inventory state.

## Incident: payment mismatch

`payment_transactions` is the money movement history. Do not “fix” totals by editing a completed transaction. Void the erroneous transaction and record the correct one, then recompute/verify order payment and deposit statuses.

See [Authentication security](AUTH_SECURITY.md) for JWT/refresh guarantees, auth rate limits, production seed requirements and deployment limitations.
