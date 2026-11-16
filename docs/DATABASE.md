# Database

PostgreSQL is the source of truth. `prisma/schema.prisma` describes the current
release schema; `prisma/migrations/202610230001_initial_release/migration.sql`
creates that schema for a new database and includes PostgreSQL-only indexes and
invariants Prisma cannot represent.

## Release database setup

This release is prepared for a **new, empty database**. The migration history is
one initial baseline. Do not point it at a database that contains data or an
older `_prisma_migrations` history. Existing Azure databases are not upgraded by
this release. Provision the new database separately, verify it is empty, and use
the deployment runbook before switching application traffic.

The baseline creates `pgcrypto`, `btree_gist`, `pg_trgm`, and `unaccent`. On
managed PostgreSQL, confirm these extensions are available and enabled for the
database user before applying migrations. Azure Database for PostgreSQL may
require `unaccent` to be added to the server's `azure.extensions` allowlist by a
server administrator before `CREATE EXTENSION` can succeed.

For a clean database, apply the baseline with:

```bash
npm run db:migrate
npm run db:seed
```

The seed creates the initial shop, RBAC permissions, and administrator from
environment configuration, then imports the approved initial catalog (13
categories, 16 colors, 6 sizes, 116 products, 121 variants, 116 media rows and
116 inventory items). It imports no previous orders or financial history.
See [Release seed](RELEASE_SEED.md) for the exact scope, offline validation,
local reset, production setup and rerun behavior.

## Schema boundaries

- `Product` is the catalog item; `ProductVariant` describes size/color; each
  `InventoryItem` is a physical rentable unit.
- `RentalOrder` owns the requested full timestamp interval. `RentalOrderItem`
  snapshots product/variant names, price, deposit, billing role, and pricing
  policy. `RentalItemAllocation` reserves a physical item over a half-open
  interval.
- `WebAccount` uses a required unique email identity. `contact_phone` is optional
  profile data. Cart and favorite rows belong to an account.
- Rental prices are resolved from the current cycle policy. Catalog product-rate
  rows are not part of this schema. Historical price amounts remain on order
  items as immutable records.
- Free accessory eligibility is captured as a boolean on the order item. A free
  line must have eligibility captured and zero rental, deposit, discount, and
  line total.

## Database-enforced invariants

The baseline includes checks for nonnegative money and quantities, positive
rental periods, canonical email/profile data, valid order/settlement states, and
versioned return-fee snapshots. It also includes SQL-only indexes for trigram
search, active product variants, primary product media, pending OTPs, and worker
retention queries.

The `rental_item_no_overlap` GiST exclusion constraint is the final concurrency
guard: the same physical inventory item cannot have overlapping HELD,
CONFIRMED, or ACTIVE allocations. Adjacent half-open intervals are allowed.

Prisma schema edits do not automatically update SQL-only invariants. Review the
baseline's custom SQL whenever changing the affected fields, and regenerate the
baseline only when preparing another intentionally fresh-database release.

## Local and test databases

`docker-compose.dev.yml` starts a local PostgreSQL 17 container. Database tests
require an explicit dedicated `TEST_DATABASE_URL`; they never use the runtime
`DATABASE_URL` as a fallback. See [Testing](TESTING.md) for test setup and
[Runbook](RUNBOOK.md) for release steps.
