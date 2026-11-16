# Reminder scheduler coordination

## Deployment topology

| Environment | Repository evidence | Conclusion |
| --- | --- | --- |
| Local/test | The application registers the scheduler; tests disable cron registration. | Not production evidence. |
| Production compose | Compose has one API service but no scheduler role, replica policy or scale guard. | A singleton scheduler is not enforced. |
| Production database | The application receives one `DATABASE_URL`; this repository has no proxy/pooling configuration. | Connection mode is unverified. |

The implementation is safe for multiple workers. Before scaling production,
record the actual replica policy, database/proxy mode, connection limits and
the owner of deployment configuration.

## Coordination model

`SchedulerJobLease` is a scheduler-owned table with a primary key and no shop
relation:

```text
jobKey      = reminders.refresh:<shopId>
ownerToken  = random UUID, never logged
leaseUntil  = database timestamp + 2 minutes
```

Lease acquisition is one parameterized
`INSERT ... ON CONFLICT ... DO UPDATE ... WHERE lease_until <= CURRENT_TIMESTAMP RETURNING`
statement. It uses PostgreSQL's clock to avoid host clock skew. Renewal runs
every 30 seconds; release is fenced by both `jobKey` and `ownerToken`, so a
stale owner cannot delete a successor's lease.

The coordinator uses short independent statements rather than a session
advisory lock. It does not assume Prisma pool session affinity or a
session-pooling proxy, and it consumes a connection only while each statement
runs.

The lease spans the full per-shop refresh:

```text
claim lease
→ capture evaluation window
→ read all due-workset pages
→ write same-key reminder intents
→ resolve stale reminders after a successful full scan
→ emit completion log
→ fenced release
```

Cron acquisition is non-blocking. A busy shop emits
`reminders.refresh.skipped_busy` and does not read candidate pages, upsert
reminders or resolve stale rows. An infrastructure error while claiming is a
refresh failure, not a busy skip. A process-local held-key guard also prevents
overlapping callbacks in the same process; different shops may refresh in
parallel.

## Lease loss and recovery

If renewal is rejected or fails, `assertActive()` stops the owner before its
next page, write or final resolution boundary. A process crash stops renewals,
allowing another worker to take over after expiry. A takeover can rescan from
the beginning; same-key upserts preserve terminal lifecycle state, but this is
not an exactly-once guarantee.

There is a bounded failure window if connectivity is lost just after a
ownership check while a query is already in flight. The next ownership check
stops later writes or resolution. Monitor database disconnects and refresh
duration; do not describe this as exactly-once processing.

`POST /admin/reminders/refresh` uses the same lease. If another worker owns the
shop, it returns HTTP 409. Dismissing a reminder is not serialized behind a
long scheduler lease; atomic same-key upsert behavior preserves a concurrent
dismissal.

## Instrumentation

Successful refresh logs include the workset fields and:

```text
coordinationMode=database_lease
ownerAcquired=true
```

Busy cron attempts log `reminders.refresh.skipped_busy` with `shopId` and the
coordination mode. Lease-release failures log a safe job key and error class or
message. Customer data, order content, owner tokens, SQL and connection strings
are not logged.

## Database and verification

`scheduler_job_leases` is part of the fresh-database baseline. Apply it only as
part of that baseline on a new, empty database. See [Database](DATABASE.md) and
[Testing](TESTING.md); never apply the baseline to a database with existing
data or migration history.

`test/integration/reminder-refresh-coordination.integration.spec.ts` covers
independent workers on the same shop, different shops, same-process
reentrancy, expired-owner fencing, callback-error release, and a second cron
worker blocked from a two-page refresh. Run it only with a dedicated test
database:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://.../kitty_test?schema=public'
npm run test:db:migrate
npm run test:integration -- --runTestsByPath test/integration/reminder-refresh-coordination.integration.spec.ts
```

## Operations before scale

1. Confirm the fresh-database baseline migration completed successfully.
2. Record API replica count and verify two replicas cannot own the same shop
   refresh concurrently.
3. Record whether database access is direct or pooled. The lease does not
   require session affinity, but atomic statements must be supported.
4. Alert on repeated busy skips, failed refreshes, lease-release failures and
   refresh duration approaching the ten-minute cadence.
5. During an intentional API restart, verify the old lease expires and a later
   cron run resumes. Do not manually delete production lease rows as routine
   recovery.

The lease coordinates active refresh workers only. It does not provide leader
election, exactly-once notification delivery, or a replacement for idempotent
reminder upserts.
