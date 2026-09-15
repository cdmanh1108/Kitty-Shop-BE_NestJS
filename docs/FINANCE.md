# Finance /thu-chi (2026-09-15)

## Audit and recognition decision

The previous page read an unbounded mock transaction collection, filtered and summed it in React, and used client pagination. It displayed three totals and six table columns; no breakdown or chart existed. Its mixed income/expense form wrote only mock data. The existing backend already owns expenses, expense categories, order charges, payment records and auditable expense creation/voiding. Its general payment/expense list endpoints return persistence relations that are unnecessary for this page. Reuse this foundation; do not build another ledger.

Finance now means **recognized revenue on COMPLETED rental orders at completedAt**, minus PAID, nonvoided operating expenses on expenseDate. RESERVED, CONFIRMED, ACTIVE, RETURNED, CANCELLED, and completed records without completedAt are excluded. Completion is performed by the existing settlement flow. Confirmation and return alone do not recognize revenue. Profit here is revenue less recorded operating expenses, not tax or full accounting profit.

This intentionally differs from Dashboard/Reports cash-ledger metrics. Those pages and their semantics were not migrated. Never replace this read source with sums of payment acknowledgements just to make the pages equal.

## Canonical sources

| Entry | Source and recognition |
| --- | --- |
| Rental after discount | Completed order grandTotal - chargesTotal, at completedAt; preserves the finalized rounded/clamped total and applies the order discount once |
| Extra rental | Nonvoided RentalOrderCharge RENTAL_EXTRA, amount × quantity; grouped with rental |
| Accessory | Explicit ACCESSORY charge only; never infer accessory from product names/items |
| Late fee | LATE charge |
| Cleaning/damage | CLEANING, REPAIR, DAMAGE, LOST_ITEM charges, one combined UI group |
| Shipping | SHIPPING charge only; booking already materializes delivery shipping into this charge. Never add Delivery shipping again |
| Other | OTHER charge |
| Genuine rental refund | COMPLETED, nonvoided OUT ORDER_REFUND payment for a completed order, paidAt >= completedAt; signed negative revenue at paidAt |
| Operating expense | PAID, nonvoided Expense amount on its business expenseDate |

All charge rows use their order completion time. Charge amounts are not duplicated by the order rental residual. Discounts are assigned to the rental residual because the domain has only an order-wide discount and no per-charge allocation. That residual can be negative when discounts cover charges; this preserves the finalized total instead of inventing a distribution. A void charge is excluded; no API in this migration mutates finalized charges or changes totals.

Precompletion ORDER_REFUND records reconcile prepayments, rather than reducing the finalized price again. Postcompletion ORDER_REFUND records are explicit revenue reversals. DEPOSIT_REFUND is always excluded. Future price-adjustment/refund workflows must preserve this distinction; do not infer refunds from notes.

Deposit, cash/document collateral, receipt confirmation, settlement refunds and additional collection are NOT additional revenue/expense. Internal deposit-offset ledger pairs describe how a canonical charge is funded. The read model never joins confirmation/settlement history and never includes ordinary incoming payment records.

Examples covered by PostgreSQL tests:

- Rental 1,000,000 + late 100,000 + cleaning 50,000 + shipping 100,000; expense 300,000 → revenue 1,250,000, profit 950,000.
- Rental 50,000 + deposit/refund 200,000 → revenue 50,000, expense 0.
- Rental 50,000 + damage 200,000 funded by deposit 300,000, refund 100,000 → revenue 250,000.
- Rental 50,000 + damage 350,000 funded by deposit 200,000 and collection 150,000 → revenue 400,000.

## Contract and permissions

- `GET /finance/summary`: period `{from,to,timezone}`, totalRevenue, totalExpenses, profit, breakdown `[{category,amount}]`. No transaction array.
- `GET /finance/transactions`: `items`, standard `meta {page,limit,total,totalPages}`. Row: id, code, occurredAt, direction, category, description, amount, nullable orderId/orderCode. No customer/order graph, audit JSON, collateral or storage metadata.
- Both support preset today/week/month/custom (default month), inclusive custom from/to (YYYY-MM-DD), direction INCOME/EXPENSE and canonical category. Custom range is bounded to 366 dates. Summary filters match table filters, independent of pagination/sort.
- Transactions use existing page/limit (max 100), sort newest/oldest; timestamp ties sort by stable source-prefixed id (`rental:`, `charge:`, `refund:`, `expense:`).
- `GET /expense-categories` now selects/returns only active id/name; loaded when the expense form opens.
- `POST /expenses` reuses persistence and AuditLog, validates trimmed description and actual date, returns the existing minimal ExpenseResDto. Existing void endpoint remains; page had no edit/void action, so none was added. No hard delete.
- Read endpoints require finance.view. Expense writes require finance.manage in BE. FE hides management and order links without their corresponding permissions.
- Money remains exact PostgreSQL decimal and decimal strings in responses, matching existing Finance convention. FE converts only at the shared currency presentation formatter. No locale-formatted amount crosses the API.
- Global API error response decorators/filters and Vietnamese error normalization remain in place. Swagger schemas exported in BE and generated into FE, without handwritten response copies.

There was no authoritative standalone manual-income persistence behind the former mock form. Income is recorded through the existing rental flow; the Finance page creates real expenses. Standalone manual-income business design is not invented by this migration.

## Query/index review

Each endpoint issues one shop-timezone lookup and one parameterized SQL statement. The latter performs SUM/GROUP BY or filtered count plus a bounded page inside PostgreSQL. No full collection is hydrated in Node; no per-row queries. Every branch and order join is shop-scoped. Summary and transactions share one canonical SQL source.

Timestamp predicates are >= start and < next local midnight, using Shop.timezone and injected Clock. Week starts Monday. Expenses use native DATE bounds; the indexed column is never wrapped in DATE(). Date-only expenses appear at local midnight in the normalized table. DST conversion is tested.

New migration `202609150002_finance_completed_period` adds RentalOrder(shopId,status,completedAt) for the finalized period scan. Existing Expense(shopId,expenseDate,status), PaymentTransaction(shopId,paidAt,status), and charge(orderId,chargeType) indexes support remaining branches. No historical migration was edited. Query counts are asserted against PostgreSQL; no claim of production EXPLAIN/load benchmarking is made.

## Frontend migration and request budget

Feature-owned generated adapters/queries; URL stores period, direction/category, sort, page/limit. Summary and table keys have separate lifecycles. Initial load: two real requests in parallel (previously one unbounded mock collection, zero real requests). Paging: one transactions request. Date change: summary + transactions. Expense form: one cached categories request when opened, then one create mutation and targeted Finance summary/list invalidation. Order writes also invalidate Finance caches.

No React aggregation, mock fallback, browser reload, duplicated server state or current-page totals. Expense form preserves normalized Vietnamese mutation errors. Pending reads show skeletons; failures show ErrorState and retry; empty results show zero totals and the Vietnamese empty message. Order links use actual orderId.

Removed old Finance types/hooks, client totals/filtering, mock creation and fictitious payment choices from this page. Shared legacy payment types moved to `src/legacy/finance`; shared transaction fixtures and the isolated mock Order payment helper remain for unmigrated Reports and mock Order tests, outside the real Finance runtime dependency graph. No Dashboard/Reports migration is included.

## Verification coverage

Unit tests cover today/week/month/custom, midnight/DST and invalid/bounded periods. PostgreSQL tests cover A–D, deposit offsets, discounts, real refunds, void/pending expenses, completion status, dates, shop isolation, constant query count, filtered pagination and stable sort. HTTP tests cover 401/403, view/manage separation, DTO validation, category isolation, expense persistence and AuditLog. FE tests cover real HTTP request counts, totals/breakdown, navigation, all presets/custom, pagination, empty/error/retry, permissions and expense mutation/cache scopes. Transitive boundary tests include Finance.

## Files and deployment

Backend: `src/modules/finance/api/finance-read.{controller,dto}.ts`, application/finance-read.service.ts, domain/finance-read.repository.ts, infrastructure/prisma-finance-read.repository.ts; existing Finance controller/DTO/service/category port/repository/module; shared timezone helper export; Prisma schema and new migration; three finance-read test suites.

Frontend: `features/finance/api/*`, FinancePage, TransactionFilters, ExpenseForm, category/URL filter models; optional stable getRowId in DataTable; query invalidation and boundary/cache/page tests; regenerated OpenAPI snapshot/schema; isolated legacy types and mock Order payment helper; API migration status.

Apply the new migration through the normal deployment process before serving the new read endpoints. No production database was modified during this task. No historical financial data was backfilled or rewritten.

Verification performed on the task branch: Backend `npm run quality` passed (429 unit tests, lint, build, OpenAPI export), standalone typecheck passed; full PostgreSQL integration passed (110 tests) and HTTP E2E passed (18 tests). `prisma validate`, clean migration deploy and migration status passed on disposable PostgreSQL 17. Prisma Client generation from an identical schema with only an alternate ignored output directory passed. The default `npm run db:generate` failed with Windows EPERM replacing the in-use query engine DLL, including outside the sandbox; existing application processes were not stopped. Temporary validation schema was removed. This output-directory workaround validates generation without overwriting the active DLL.
