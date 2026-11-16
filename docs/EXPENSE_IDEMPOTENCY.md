# Expense creation idempotency

`POST /admin/expenses` requires exactly one `Idempotency-Key`, containing 1–255
non-whitespace ASCII characters. Generate a key once per intentional expense;
retries must preserve that key and the original body. A distinct expense gets a
new key even when every expense field is identical. The key is not a receipt
number, authentication credential or a substitute for `finance.manage`.

Claims use the authenticated shop and the actor-scoped namespace
`finance.expense.create.v1:<memberId>`. Another member cannot replay a colleague's
expense through the same key. Request hashing includes all accepted input:
category, amount, trimmed description, calendar expense date, optional order and
inventory references, method, vendor, receipt URL and paid-at instant. Optional
omissions use stable null markers; equivalent paid-at offsets share a UTC
instant. The hash does not include a generated expense number or execution time.

An execution owner locks its claim before any expense write. Category and
related-entity shop checks, expense insertion, durable CREATE audit and the
versioned public completion snapshot share one Serializable transaction. Audit
or completion failure rolls back the expense. Stale recovery rotates the claim
token; an older owner cannot write, complete or delete the successor. Failed
claim cleanup does not replace the original error. No schema change or new
expense outbox event is required.

A completed request replays its original 201 response and `Cache-Control:
no-store`, including the saved expense ID/number, category, description, decimal
string amount, status and calendar date. Replay runs before current category or
related-record eligibility checks, adds no audit row and never changes after a
later expense void. A malformed stored snapshot fails safely without inserting
another expense.

| Response code                                          | Meaning and caller behavior                                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID` | 400; fix the request contract.                                                                                         |
| `IDEMPOTENCY_KEY_REUSED`                               | 409; the key already belongs to different input. Do not rotate it automatically.                                       |
| `IDEMPOTENCY_IN_PROGRESS` / `IDEMPOTENCY_CLAIM_LOST`   | 409; retry the same key/body after the current attempt settles.                                                        |
| `INTERNAL_SERVER_ERROR`                                | 500, including an invalid retained snapshot; retain the original key and reconcile rather than creating a new expense. |

Completed results are retained for 30 days. Processing leases use the shared
five-minute fence. These are separate deadlines: an expired processing lease
does not prove execution stopped, and result retention is not indefinite
deduplication. Beyond retention, reconcile through Finance reads before
deliberately creating a new expense.

## Admin recovery

The Admin adapter sends the key as a header, validates the success response and
does not automatically retry a mutation. It also binds the request to its
original staff identity and aborts dispatch if auth refresh changes that owner.
A validation rejection before any
uncertain result permits corrections. Network/timeouts, cancellation, server
errors, malformed success and idempotency conflicts freeze the payload; a later
validation/auth error does not resolve an earlier uncertain result.

The active tab retains the pending key, timestamp, actor IDs and the four expense
form fields in owner-scoped `sessionStorage` before dispatch. It stores no
authentication token or staff profile. Closing/reopening the dialog or reloading
that tab restores the same request. Success or a definitive initial rejection
clears its persisted marker; a deliberately new identical expense gets a new
key. If tab storage is unavailable, retries remain in memory and an uncertain
form stays open. After 30 days the UI blocks replay. Starting a separate expense
while a result remains uncertain requires explicit acknowledgement that Finance
has been checked first; it never silently rotates the pending request's key.

Starting a separate intent does not cancel the prior server request, which may
still commit. The confirmation states this explicitly. Use the original retry
action for ordinary recovery; a separate intent means another real expense.

Tab storage is not a shared recovery service. Clearing browser data or ending
the tab session can lose the marker; reconcile an uncertain expense through
Finance reads before re-entering it in another tab/device. The backend still
authorizes every request independently of browser metadata.

## Deployment and verification

Deploy the backend first, then the matching Admin build. Older open Admin tabs
must reload when the server requires the new header. A client without the
header receives 400 instead of falling back to unprotected creation. Do not
deploy the new retrying Admin against an older backend that ignores the key. The
storefront API is unchanged. Regenerate contracts using `npm run openapi:export`
in BE and `npm run api:sync` in Admin; do not hand-edit generated files.

Regression coverage includes application claims and cleanup, real PostgreSQL
lost-response replay, intentionally identical expenses, payload mismatch,
actor/shop isolation, concurrent submissions, rollback on audit/completion
failure and stale-owner fencing. HTTP tests exercise required/duplicate headers,
replay, conflicts and permissions. Admin tests cover immutable retry payloads,
tab restoration, expiry, storage failure and the actual API header boundary.

Validation on 2026-11-16:

- Typecheck, formatting, `npm run quality` and OpenAPI freshness passed: 782
  database-free tests plus 18 Swagger tests, production build and entrypoint.
- A fresh owned PostgreSQL 17 database applied both committed migrations; the
  final full runs passed 204 integration tests / 44 suites and 68 HTTP E2E tests /
  18 suites. The container was removed afterwards; the runtime database was not
  used. No migration was added by this change.
- The Admin contract matches the exported backend contract; the storefront
  contract and database schema are unchanged.
- The first full integration run observed one existing rental-concurrency
  assertion returning PrismaClientUnknownRequestError instead of
  RentalOverlapError. Its focused rerun and the next full run passed with rental
  code and assertions unchanged. The cause of that initial exception is not
  confirmed; the observation is retained rather than treated as a fixed bug.
