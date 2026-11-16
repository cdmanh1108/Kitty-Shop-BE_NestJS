# Release runbook

## New-database release

This release expects a separately provisioned, empty PostgreSQL database. Its
Prisma history has one initial-release baseline and is not an upgrade path for an
existing database. Do not run `prisma migrate deploy` against the old Azure
database or any database containing business data.

Before migration, confirm the target database is empty and that its PostgreSQL
server allows `pgcrypto`, `btree_gist`, `pg_trgm`, and `unaccent`. On Azure,
`unaccent` may need to be added to the `azure.extensions` server parameter by a
server administrator. Then configure the deployment secret `DATABASE_URL` for
the **new** database and run the one-off migrator:

```bash
docker compose --profile migrate pull migrate
docker compose --profile migrate run --rm migrate
docker compose --profile migrate run --rm migrate npm run db:seed
```

Verify the migration completed, the seed created the intended initial shop,
admin and approved catalog records, and the API health endpoints are ready before switching
traffic. Keep the old database isolated until the owner has completed their
data-retention and cutover decisions; this runbook never drops it.

## Local setup

```bash
npm ci
npm run bootstrap
npm run start:dev
```

`npm run bootstrap` prepares `.env`, starts local PostgreSQL when configured,
applies the baseline, seeds RBAC/shop/admin plus the approved catalog, and exports OpenAPI.
For an existing local PostgreSQL server, configure `DATABASE_URL` and set
`DB_AUTO_START=false` first.

See [Release seed](RELEASE_SEED.md) for catalog counts, local reset commands,
explicit environment-file selection and protection of later business edits.

## Production configuration

- Use managed PostgreSQL with backups and a rehearsed restore procedure.
- Set signing keys and database credentials through a secret manager.
- Remove or rotate seeded administrator credentials before serving traffic.
- Set `NODE_ENV=production` and exact `CORS_ORIGINS`; do not use `*` with
  credentialed requests.
- Enable `TRUST_PROXY` only behind a trusted proxy/load balancer.
- Set `SWAGGER_ENABLED=false` when public API documentation is not wanted.
- Run the migrator once, then deploy the API and frontend builds that match the
  exported Admin/Web contracts.
- Collect structured application logs and PostgreSQL metrics; alert on 5xx rate,
  connection exhaustion, migration failures, and storage growth.

## Backups and incidents

Back up PostgreSQL and test restores regularly. Product media is stored in
object storage; back up its objects according to the provider policy.

If an overlapping reservation is reported, do not disable the exclusion
constraint. Inspect allocation state and exact timestamps, then reconcile the
orders before changing inventory state.

Payment transactions are the money-movement history. Do not edit a completed
transaction to repair a mismatch. Void the incorrect entry, record the correct
one, and verify order payment/deposit state.

See [Authentication security](AUTH_SECURITY.md), [Logging](LOGGING.md), and
[Database](DATABASE.md) for detailed boundaries and configuration.
