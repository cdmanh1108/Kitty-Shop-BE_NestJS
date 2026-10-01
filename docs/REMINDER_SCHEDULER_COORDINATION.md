# Reminder scheduler coordination (C40)

## Topology decision

| Environment         | Evidence in this repository                                                                                                            | Scheduler conclusion                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Local/test          | `AppModule` registers `ScheduleModule.forRoot()` and `ReminderService` registers the cron. Tests explicitly disable cron registration. | Not production evidence.               |
| Production compose  | `docker-compose.yml` has one `api` service, but has no scheduler role, replica policy or scale guard.                                  | A singleton scheduler is not enforced. |
| Production DB/proxy | The application receives one `DATABASE_URL`; this repository has no proxy/pooling configuration.                                       | `UNVERIFIED` for G04.                  |

The source therefore implements the multi-worker-safe path rather than claiming a deployment singleton. Before scaling production, G04 must record the actual replica policy, DB/proxy mode, connection limits and the owner of that deployment configuration.

## Coordination model

`SchedulerJobLease` is a narrow scheduler-owned table. It has no shop relation and uses a primary key only:

```text
jobKey      = reminders.refresh:<shopId>
ownerToken  = random UUID, never logged
leaseUntil  = database timestamp + 2 minutes
```

Lease acquisition is one parameterized `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE lease_until <= CURRENT_TIMESTAMP RETURNING` statement. It uses PostgreSQL's clock, avoiding host clock skew. Renewal runs every 30 seconds and release is fenced by both `jobKey` and `ownerToken`; a stale owner cannot delete a successor's lease.

This is deliberately a DB-backed lease rather than a session advisory lock. The coordinator uses short independent statements, so it does not assume Prisma pool session affinity or a session-pooling proxy. It consumes one ordinary database connection only while an individual statement executes, not a permanently pinned connection per shop.

The owner holds the lease across the complete C39 critical section:

```text
claim lease
→ capture evaluation window
→ read all C39 cursor pages
→ write same-key C33 reminder intents
→ resolveMissing after successful full scan
→ emit completion log
→ fenced release
```

Cron acquisition is non-blocking. A busy shop emits `reminders.refresh.skipped_busy` and no candidate-page, upsert or stale-resolution query is run by that worker. An infrastructure error while claiming is a refresh failure, not a busy skip.

The coordinator keeps a process-local held-key guard as well as the database claim, preventing same-process overlapping callbacks from entering the same shop. Different shop keys may run concurrently on different workers.

## Lease loss and recovery

Heartbeat renewal means a normal refresh may exceed the two-minute lease duration. If renewal is rejected or fails, `assertActive()` stops the owner before its next C39 page, upsert or final resolution boundary; the failure is logged through the existing per-shop refresh failure path. A process crash stops renewals, so another worker can take over after expiry. Restart/takeover can reprocess pages from the beginning; C33 same-key upserts preserve terminal lifecycle state and this is not an exactly-once guarantee.

There remains a bounded failure window if a worker loses database connectivity immediately after a boundary while an already-issued query is in flight. The next ownership check aborts subsequent writes/final resolution. G04 should monitor DB disconnects and refresh durations; no deployment claim should describe this as an exactly-once scheduler.

## Manual refresh

`POST /admin/reminders/refresh` uses the same per-shop lease. If another refresh owns the shop, it returns HTTP 409 rather than incorrectly reporting `{ refreshed: true }`. Dismissing a reminder is intentionally not serialized behind a long scheduler lease; C33's atomic same-key upsert continues to preserve a concurrent dismissal.

## Instrumentation

Successful refresh logs retain the C39 workset fields and add:

```text
coordinationMode=database_lease
ownerAcquired=true
```

Busy cron attempts log `reminders.refresh.skipped_busy` with `shopId` and coordination mode. Lease-release infrastructure failures log a safe job key and error class/message through Nest's error logger. No customer, order content, owner token, SQL or connection string is logged.

## Migration and verification

Migration `202609230002_reminder_refresh_leases` creates `scheduler_job_leases`. A disposable PostgreSQL 17 verification database successfully applied all 21 migrations with `prisma migrate deploy`, including this migration. G01 remains a deployment requirement: rehearse the same command on a representative staging database before production deployment, then monitor migration completion and the first scheduler cycles.

Real PostgreSQL tests in `test/integration/reminder-refresh-coordination.integration.spec.ts` cover independent workers on the same shop, different shops, same-process reentrancy, expired-owner fencing, callback-error release, and a second cron worker blocked from a real 101-order/two-page C39 scan. These passed after that disposable migration run.

The empty, unapplied `202609230001_audit_log_timeline_index` directory was intentionally removed. It contained no `migration.sql` and was not part of the migration history, so it must not be restored. To repeat the disposable verification:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://.../kitty_test?schema=public'
npm run test:db:migrate
npm run test:integration -- --runTestsByPath test/integration/reminder-refresh-coordination.integration.spec.ts
```

## G04 runbook before scale

1. Confirm the deployed image contains migration `202609230002_reminder_refresh_leases` and the migration job completed.
2. Record API replica count and verify two replicas can boot without two owners for the same shop.
3. Record whether the database path is direct, session pooled or transaction pooled. The lease does not require session affinity, but database connectivity and ordinary atomic statements must be supported.
4. Alert on repeated `reminders.refresh.skipped_busy`, `reminders.refresh.failed`, lease release failures, and refresh duration approaching the ten-minute cadence.
5. During an intentional API restart, verify the old lease expires and a later cron run resumes; do not manually delete production lease rows as a normal recovery procedure.

C40 coordinates active refresh workers only. It does not provide leader election, exactly-once notification delivery, or a replacement for C33/C39 idempotency.
