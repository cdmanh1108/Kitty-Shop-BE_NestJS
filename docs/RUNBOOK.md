# Release runbook

## Two free accessories per paid item

The accessory allowance is now `2 * paid quantity`. No schema change, migration,
reset or repricing of saved order lines is required. Existing per-selection/order
quantity limits and physical stock restrictions still apply.

Deploy the backend, storefront and Admin together in a short coordinated
maintenance window for this policy change. The storefront checks quote allowance
against its local selection model; mixing the 1:1 and 1:2 versions can reject
quotes even for a cart with no free selections. Refresh open storefront/Admin
tabs afterward. Do not relax quote validation to bypass a mixed deployment.

Smoke-test one paid unit with two free accessories (accepted), one with three
(rejected), and two paid units with four free accessories. Confirm the displayed
capacity and stock checks, and that only paid units determine pricing tiers.

## Update an initialized release database

For this release update, configure both applications before deploying:

1. Put the same independent random 64-hex `WEB_BFF_CLIENT_CONTEXT_SECRET` in
   backend server `.env` and Vercel Production (Preview too if used). Keep it
   server-only. See [BFF client identity](WEB_BFF_CLIENT_CONTEXT.md).
2. Backend `CORS_ORIGINS` must contain the exact HTTPS origins of **both Admin
   and the storefront**, separated by commas. The Web BFF forwards `Origin`;
   allowing only Admin causes storefront authentication to return 403.
3. Vercel `BACKEND_BASE_URL` must use HTTPS and the real `/api/v1` prefix;
   `NEXT_PUBLIC_SITE_URL` is the public storefront origin. Production backend
   must keep `AUTH_OTP_BYPASS_ENABLED=false`.
4. Deploy **storefront → backend API → Admin** for the first rollout of these
   changes. Storefront signs auth context before the backend requires it; the
   backend must support expense idempotency before the updated Admin is used.
   Existing initialized release databases use only pending migrations, as below.
5. Recreate the API container after changing server `.env`; redeploy Vercel
   after changing environment variables. Compose reads `.env`, not a local
   developer `.env.production`. Local env edits do not update either cloud.
6. Finish or review any in-flight/uncertain order or expense before reloading
   existing Admin tabs: the new recovery marker cannot reconstruct an intent
   sent by an older bundle. Reload storefront tabs too; older clients that omit
   the optional expected-account assertion retain their previous behavior.
   Smoke-test Web login/refresh, registration/OTP,
   profile, cart, checkout and history, then Admin login, rental creation/retry
   and expense creation/retry. Change accounts in another tab while cart sync
   is pending and confirm the previous account's draft is not saved to the new one.

Do not rotate only one side of the BFF secret on a live installation. Both sides
need the same value; follow the coordinated rotation note in the BFF document.

For a database already initialized with `202610230001_initial_release`, apply
subsequent committed migrations with the one-off migrator (or `npm run db:migrate`
from a configured source checkout), then deploy the matching API and FE builds.
The product rental-price migration adds a nullable column and preserves data;
do not reset or seed the existing release database for that update. See
[Product rental pricing](PRODUCT_RENTAL_PRICING.md).

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
