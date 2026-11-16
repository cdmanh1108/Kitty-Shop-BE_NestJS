# Reminder due-workset scan

`ReminderService` runs every ten minutes. Each active shop is processed
sequentially. One refresh captures a single `now`, shop-local day range and
24-hour return window, then reads candidates in pages of 100 orders. The full
per-shop refresh is coordinated with a database lease; see [Reminder scheduler
coordination](REMINDER_SCHEDULER_COORDINATION.md).

## Candidate selection

Every page is scoped to `shop_id` and selects only orders matching one of these
conditions:

- `RESERVED` or `CONFIRMED` orders with pickup inside the captured shop-local
  day;
- `CONFIRMED` or `ACTIVE` orders with `rental_end_at <= returnSoonEnd`;
- `RESERVED`, `CONFIRMED`, `ACTIVE` or `COMPLETED` orders whose payment is not
  `PAID`;
- `RESERVED` or `CONFIRMED` orders with a pending or partially held deposit.

The service applies exact boundaries, titles, priorities and dedupe keys. In
particular, `rentalEndAt === now` is outside the strict overdue rule. A
completed, paid order with no outstanding deposit is excluded by PostgreSQL
before materialization.

Pages use `RentalOrder.id ASC` and an `id > cursor` predicate, fetch
`limit + 1`, and return the final item ID as the next cursor. This avoids
offset scans and skips/duplicates on a stable dataset. Changes during a refresh
are not a snapshot; a newly due order behind the cursor can be collected on the
next run. No long transaction or exactly-once claim is used.

Stale reminders are resolved only after every page succeeds. A page failure
aborts the refresh before stale resolution, preserving reminders from unseen
pages. Atomic same-key upserts preserve terminal `DISMISSED` and `RESOLVED`
events.

## Instrumentation and verification

Successful per-shop refreshes emit `reminders.refresh.completed` with safe
operational fields:

```text
shopId, durationMs, pages, candidateOrders, reminderUpserts,
activeReminderKeys, resolvedCount, batchSize
```

Customer, phone, order number and reminder content are excluded. Failed refreshes
emit `reminders.refresh.failed`; a busy skip is logged if another worker owns
the shop lease.

`test/integration/reminder-due-workset.integration.spec.ts` covers irrelevant
completed/paid orders, due candidates, another shop, cursor pagination and
no-skip/no-duplicate results. It runs against a dedicated disposable PostgreSQL
database initialized with the fresh-database baseline:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://.../kitty_test?schema=public'
npm run test:db:migrate
npm run test:integration -- --runTestsByPath test/integration/reminder-due-workset.integration.spec.ts
```

Use a dedicated test or staging database to inspect a read-only query plan
before making production index decisions. Do not run benchmarks or
`EXPLAIN ANALYZE` on production.
