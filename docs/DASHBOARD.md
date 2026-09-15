# Dashboard read-model audit and integration

## Before migration

The admin Dashboard used an in-memory summary plus a separate legacy customer
collection. It joined customer names on the client, derived attention count from
an already truncated six-row array, and rendered legacy order statuses and mock
revenue. Two query sources were mounted; neither made a real Dashboard HTTP call.
The route incorrectly required customers.view because of this join.

The unused real `/dashboard/summary` endpoint had a different shape: created-today
orders instead of scheduled pickups, inventory/reminder metrics not rendered by
this UI, broad order hydration, and anonymous `object[]` Swagger rows. It executed
13 Prisma operations plus the shop-timezone lookup (relation reads and transaction
control could add SQL statements). CONFIRMED orders were incorrectly counted as
physically overdue. Recent rows had no deterministic timestamp tie-breaker.

## Contract and ownership

`GET /api/v1/dashboard/summary` now serves the actual page in one request. This is
a coordinated BE/FE contract replacement; deploy matching builds. Authorization
remains `dashboard.view`, with tenant scope from authenticated membership. No
customer, rental, or finance permission is needed to read this aggregate. Links to
order/report pages are rendered only when their destination permission is granted.

`DashboardSummaryResDto` contains numeric revenueToday/revenueMonth, ordersToday,
rentingProducts, dueSoon, overdueOrders, outstandingAmount, actionRequiredOrders,
and three explicitly documented arrays:

- `DashboardRevenuePointResDto`: seven local date strings and numeric revenue.
- `DashboardRentalResDto`: at most six id/code/customerName/pickupDate/status/itemCount rows.
- `DashboardAttentionResDto`: at most six id/code/customerName/returnDate/status/outstandingAmount/type rows.

Dates on orders are ISO timestamps. Status uses the canonical RentalStatus enum;
attention type is OVERDUE, RETURN_SETTLEMENT, or OUTSTANDING. No profiles, payment
arrays, audit/internal metadata or order item arrays cross this API boundary.
The FE imports the generated OpenAPI schema; there is no handwritten response
interface or response cast. Controller -> application -> domain port -> Prisma
infrastructure boundaries are preserved.

## Business semantics

- Revenue matches Reports and Finance: signed completed, non-voided payment
  transactions, excluding DEPOSIT/DEPOSIT_REFUND. Internal deposit offsets count
  once on their rental-payment side. Refunds subtract. Charges are represented by
  ledger receipts, not added a second time from charge rows. SQL sums NUMERIC;
  computed response amounts remain numbers under the existing Dashboard convention.
- Today/month use shop.timezone and the injected Clock, with half-open ranges.
  The chart includes today and the previous six local calendar dates, zero-filled.
  The month total covers the current calendar month, as the prior contract did.
- Orders today means scheduled pickup today, excluding DRAFT/CANCELLED. Physical
  items rented means ACTIVE allocations with released_at IS NULL; elapsed rental
  dates do not release occupancy.
- Overdue means ACTIVE and rental_end_at < now. Due soon means ACTIVE with end
  > = now and before the local day after tomorrow. This retains the old UI's
  > today/tomorrow window while avoiding overlap with already-overdue rentals.
- Open balances cover RESERVED/CONFIRMED/ACTIVE/RETURNED and equal
  max(0, grand_total - lifetime net non-deposit ledger receipts), independently
  per order. Neither confirmation snapshots nor deposits are counted twice.
- Attention prioritizes overdue, then RETURNED awaiting settlement, then positive
  open balance. COMPLETED/CANCELLED/DRAFT are excluded. Counts are independent of
  the six-row preview. No new collateral/delivery rules were invented.
- Upcoming means RESERVED/CONFIRMED pickups from the start of today, sorted by
  rental_start_at and id; itemCount sums quantity, not the number of line rows.

## Query and index audit

Three data statements per request: one shop timezone select, then two independent
SQL reads in parallel (revenue and operational summary). Authentication/permission
middleware reads are not included in this count. Parameterized SQL is isolated in
the read repository and returns typed aggregate results. No row-dependent API/DB
calls, full-table hydration, transaction wrapper, Redis or polling were added.

Revenue scans an indexed shop/date range and groups locally by day. The date
conversion is in grouping, not the WHERE predicate. Operations reuse a scoped
open-order CTE and a grouped payment balance; aggregation remains in PostgreSQL.
Customer and quantity joins run against the bounded previews. Data transferred
to Node and browser is bounded even though computing exact totals necessarily
processes the shop's relevant records inside PostgreSQL.

Existing indexes cover orders(shop_id,status), scheduled pickup ranges,
payments(shop_id,paid_at,status), payments(order_id,paid_at), item(order_id) and
customer PK lookup. New migration `202609150001_dashboard_allocation_count` adds
allocations(shop_id,status,released_at), needed for tenant-scoped active occupancy
counts; the old allocation indexes start with order/inventory IDs. No duplicate
index is added. Deploy using migrate deploy; index creation may briefly block
writers on a large allocation table. No data rewrite or old migration edit.

## Frontend behavior and cleanup

Dashboard uses its feature-owned API adapter/query, a stable key and 30-second
staleTime with centralized retry/error handling. Initial loading uses Skeleton;
background refetch retains prior data and presents an error/retry if refresh fails.
Zero counts and empty lists are distinct from failed requests. Rental and customer
mutations invalidate Dashboard specifically; existing payment invalidation remains.
The customer-query join, mock dashboard handler/facade entry and manual Dashboard
interface were removed. Shared mocks used by other pages remain isolated.

Operational count links lead to the existing ACTIVE order list (overdue/due-soon)
or order list (attention). The listing currently has no exact due-window/overdue
filter; no unsupported URL filter or client-side business classification is added.
Each preview row navigates to its real order ID. Reports remain a separate mock
page outside this migration; the existing report link is permission-gated.

## Verification

Real PostgreSQL tests cover empty data, tenant isolation including revenue,
local day/month boundaries, signed ledger/deposit/refund/void semantics, status
classification, preview limit/tie ordering, quantity summation and constant data
query count. HTTP tests cover 401/403 and dashboard.view-only access. Existing
physical occupancy integration coverage is adapted to the new response.

Frontend tests cover one HTTP request, fresh-cache reuse, real IDs/customer names,
server-supplied counts, loading/zero/empty/error/retry, retained data after refresh
failure, and destination/route permissions. Chart layout is stubbed in jsdom;
these tests do not constitute a visual browser benchmark or a production SLA.

## Verification environment notes

Prisma validate and all eleven migrations applied successfully on a disposable
PostgreSQL 17 database. The normal Prisma generation target is locked by a running
Windows process (EPERM, also outside the sandbox). Generation from the same schema
with only a temporary output-directory override succeeded, without stopping the
developer's running processes. The index-only schema change introduces no model
field/type changes. The temporary schema file was removed; verification output is
under ignored node_modules.

The full integration run exposed one pre-existing stale catalog lookup assertion:
variants already expose rentalRates, but the test expected the older shape. Only
that expected payload was updated to the existing contract; catalog production
behavior was not changed.

## Final quality gates (2026-09-15)

| Gate                                          | Result                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| BE `npm run quality`                          | PASS: lint, 420 unit tests, build, OpenAPI export                                      |
| BE `npm run typecheck`                        | PASS                                                                                   |
| BE `npm run test:integration`                 | PASS: 100 tests / 15 suites                                                            |
| BE `npm run test:e2e`                         | PASS: 17 tests / 5 suites                                                              |
| Prisma validate                               | PASS                                                                                   |
| Test database migration deploy                | PASS: all 11 migrations, including new allocation index                                |
| Prisma client generation                      | PASS with isolated output; normal output remains Windows DLL-locked as described above |
| FE `npm run api:sync`                         | PASS: regenerated snapshot and TypeScript schema from BE export                        |
| FE `npm run check`                            | PASS: API contract check, typecheck, lint, 322 tests / 46 suites, production build     |
| Changed source formatting and Git diff checks | PASS                                                                                   |

FE's first sandbox build could not replace an existing dist file; the final full
check passed outside the sandbox. No application/development database migration
was performed. These are local test results, not measured production latency.
