# Auth ephemeral-data cleanup

`AuthCleanupService` runs daily at 03:15 server time. It uses the existing
`scheduler_job_leases` table with owner-token fencing, so one API replica runs the
job while the others safely skip it. A failed phase stops the job, is logged as
`auth.cleanup.failed` with its phase and error class, and is retried on the next schedule;
the API process stays up.

Configuration defaults are intentionally conservative:

| Variable                            | Default | Meaning                                                          |
| ----------------------------------- | ------: | ---------------------------------------------------------------- |
| `AUTH_CLEANUP_ENABLED`              |  `true` | Enables the scheduled job and explicit cleanup execution.        |
| `AUTH_REFRESH_TOKEN_RETENTION_DAYS` |    `30` | Security-history window after a token's expiry/revocation event. |
| `AUTH_OTP_RETENTION_HOURS`          |    `24` | Retention after OTP expiry or consumption/supersession.          |
| `AUTH_CLEANUP_BATCH_SIZE`           |   `500` | Maximum family/challenge rows deleted per short transaction.     |

Refresh tokens are never deleted independently. A family is purgeable only when its
family event and **every** member token's terminal event are older than the refresh
cutoff. An unrevoked token uses `expires_at`; a revoked/rotated/compromised token uses
`revoked_at`. Deleting the family then cascades all members together, preserving the
Task 09 lineage/reuse invariant for the full security window.

OTP challenges use `COALESCE(consumed_at, expires_at)`: active challenges have neither
a terminal event before the cutoff and are retained. Consumed, superseded, exhausted and
expired challenges are all retained for the configured OTP window before purge.

The repository locks candidate IDs with `FOR UPDATE SKIP LOCKED`, deletes one bounded
batch, and repeats. The operation is idempotent; concurrent owners cannot overlap because
of the lease. Logs contain only aggregate deleted counts, batch count, duration, job state,
phase and error class; they never contain token hashes, raw tokens, OTPs or account data.
