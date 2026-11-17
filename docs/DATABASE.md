# Database

PostgreSQL is the source of truth. `prisma/schema.prisma` describes the current
release schema; `prisma/migrations/202610230001_initial_release/migration.sql`
creates the initial schema for a new database and includes PostgreSQL-only indexes and
invariants Prisma cannot represent. Subsequent committed migrations upgrade that baseline.

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
- Products may have a nullable `rentalPriceOverride`; null uses the shop price,
  zero is explicit. The additive `202611160001_product_rental_price_override`
  migration preserves all catalog and order data. See [Product rental pricing](PRODUCT_RENTAL_PRICING.md).
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
baseline's custom SQL whenever changing the affected fields. Never rewrite an
applied baseline; use additive migrations for deployed databases.

### Index metadata and migration review

The baseline creates `customers_full_name_trgm_idx`, `products_name_trgm_idx`
and `web_otp_challenges_account_attempt_idx`. Their definitions are also declared
in `schema.prisma`, with the exact physical index names. The trigram indexes use
`type: Gin` and `ops: raw("gin_trgm_ops")`, supported by
[Prisma 6 index metadata](https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/indexes).
Adding these declarations reconciles metadata only: it requires no migration,
index rebuild, baseline edit or production data change.

`test/integration/schema-drift.integration.spec.ts` compares the explicitly
guarded, migrated `TEST_DATABASE_URL` to the Prisma datamodel using read-only
`migrate diff --script --exit-code`. An empty supported diff is required; this
prevents future generated migrations from silently proposing the three index drops.
The check never executes its generated SQL and never falls back to runtime `.env`.

Prisma's diff covers supported database features only; see the
[Prisma 6 CLI reference](https://www.prisma.io/docs/orm/v6/reference/prisma-cli-reference).
It does not prove preservation of expression/partial indexes, check constraints
or the rental exclusion constraint. Continue reviewing those PostgreSQL-only
definitions and running database invariant/concurrency suites. Do not replace
the committed migration chain with `db push`, execute diff output blindly, or
rewrite an applied baseline to make drift disappear.

## Local and test databases

`docker-compose.dev.yml` starts a local PostgreSQL 17 container. Database tests
require an explicit dedicated `TEST_DATABASE_URL`; they never use the runtime
`DATABASE_URL` as a fallback. See [Testing](TESTING.md) for test setup and
[Runbook](RUNBOOK.md) for release steps.

## Product accessory limits

`Product.freeAccessoryLimit` is a nonnegative integer, default 1. The additive `202611170001_product_free_accessory_limit` migration initializes all existing products to 1 without changing order history or other catalog data. This entitlement is independent of `allowFreeAccessory` (whether a product can itself be selected free). Order capacity is the sum of each PAID quantity multiplied by its current product limit; FREE_ACCESSORY lines grant no capacity.
