# Reminder due-workset scan (C39)

`ReminderService` runs every ten minutes. Each active shop is processed sequentially; one refresh captures a single `now`, shop-local day range and 24-hour return window, then reads the candidate workset in pages of 100 orders. C40 coordinates the full per-shop critical section with a DB-backed lease; see [Reminder scheduler coordination](REMINDER_SCHEDULER_COORDINATION.md).

## Candidate predicate

The repository scopes every page to `shop_id` and reads only these OR arms:

- `RESERVED`/`CONFIRMED` orders whose pickup time is inside the captured shop-local day;
- `CONFIRMED`/`ACTIVE` orders with `rental_end_at <= returnSoonEnd`, a safe superset of return-today, return-soon and overdue;
- the pre-existing candidate statuses (`RESERVED`, `CONFIRMED`, `ACTIVE`, `COMPLETED`) with a non-`PAID` payment state;
- `RESERVED`/`CONFIRMED` orders requiring a pending or partially held deposit.

The service continues to apply exact boundaries, titles, priorities and dedupe keys. In particular, `rentalEndAt === now` remains outside the strict overdue rule. A completed, paid order with no outstanding deposit matches none of these arms and is excluded by PostgreSQL before materialization.

Pages use `RentalOrder.id ASC` plus `id > cursor`, fetch `limit + 1`, and return the final item ID as the next cursor. This makes a stable dataset no-skip/no-duplicate without offset scans. Changes made while a refresh is running are not a snapshot: an order newly due behind the cursor can be collected on the next ten-minute run. There is no long transaction or exactly-once claim.

`resolveMissing` runs exactly once only after all pages succeed. If a page fails, refresh aborts and skips stale resolution, preserving reminders from unseen pages. Existing C33 same-key upsert behavior remains unchanged, so `DISMISSED` and `RESOLVED` events are never revived by this scan.

## Runtime instrumentation

Successful per-shop refreshes emit `reminders.refresh.completed` with only safe operational fields:

```text
shopId, durationMs, pages, candidateOrders, reminderUpserts,
activeReminderKeys, resolvedCount, batchSize
```

The event deliberately excludes customer, phone, order number and reminder content. Failed shop refreshes retain `reminders.refresh.failed`; C40 emits a safe busy-skip event when another worker owns the same shop refresh.

## PostgreSQL regression and query-plan status

`test/integration/reminder-due-workset.integration.spec.ts` seeds 300 irrelevant completed/paid historical orders, seven due candidates, and a due order in another shop. It verifies that four cursor pages return only the seven shop candidates, with no skip or duplicate.

Migration: none for C39. The existing `RentalOrder` indexes are retained. A disposable PostgreSQL 17 database applied all 21 migrations with `prisma migrate deploy`, then ran the 300-history/7-candidate regression successfully. The matching read-only `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` captured for the same fixture returned seven rows, removed 301 rows by filter, used a sequential scan with 12 shared-hit blocks, and completed in 0.151 ms. A sequential scan is expected for this small representative fixture; this evidence does not justify a new production index.

The empty, unapplied `202609230001_audit_log_timeline_index` directory was intentionally removed; it had no `migration.sql` and was not part of the migration history. A representative staging migration rehearsal and production-cardinality plan measurement remain required before any future index decision. Do not interpret the disposable test result as proof that existing indexes are sufficient at production volume.

Before any production index decision, use a dedicated PostgreSQL test or staging database, migrate it, run the regression seed, and capture the read-only plan for the candidate predicate. Record scan type, returned/scanned rows, buffers, planning time and execution time. Do not run a benchmark or `EXPLAIN ANALYZE` on production.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://.../kitty_test?schema=public'
npm run test:db:migrate
npm run test:integration -- --runTestsByPath test/integration/reminder-due-workset.integration.spec.ts
```

Run these commands against a dedicated database, then capture the candidate read plan there.

## C40 handoff

The cron frequency remains ten minutes. A shop refresh scans all pages sequentially with batch size 100 and relies on C33 idempotent same-event upserts. C40 owns per-shop lease coordination; G04 still owns deployment topology and operational verification before scaling.
