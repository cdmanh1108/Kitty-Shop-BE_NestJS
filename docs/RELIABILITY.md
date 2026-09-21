# Audit, outbox and rental idempotency

## Side-effect inventory

The previous AuditService explicitly documented best-effort behavior and caught/logged
persistence failures. This policy is preserved; no post-commit audit becomes mandatory.

| Command / module                     | Transactional business records                                            | audit_logs                                                 | Required outbox                                   |
| ------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| Rental creation                      | Order/items/allocations/charges/delivery/status history/replay completion | Best effort after commit                                   | RENTAL_ORDER_CREATED in the same transaction      |
| Rental confirm/start/complete/cancel | Order/items/allocations, applicable inventory/history                     | Best effort after commit                                   | RENTAL*ORDER*{status} in the same transaction     |
| Rental reschedule                    | Order/items/allocations dates                                             | Best effort after commit                                   | RENTAL_ORDER_RESCHEDULED in the same transaction  |
| Rental charge                        | Charge/totals/payment state                                               | Best effort after commit                                   | None currently                                    |
| Manual keyed payment creation        | Payment and payment/deposit recomputation                                 | Durable CREATE audit in the same transaction               | PAYMENT_RECORDED and completion snapshot together |
| Legacy/internal payment creation     | Payment and payment/deposit recomputation                                 | Best effort after commit where its caller uses AuditPort   | PAYMENT_RECORDED in the same transaction          |
| Payment void                         | Void and payment/deposit recomputation                                    | Best effort after commit                                   | None currently                                    |
| Expense create/void                  | Existing expense persistence boundaries                                   | Best effort after success                                  | None currently                                    |
| Product/variant/media                | Existing aggregate/media transactions                                     | Existing audited commands remain best effort after success | None currently                                    |
| Inventory state                      | Inventory and status history                                              | Best effort after commit                                   | None currently                                    |
| Customer/member/settings             | Existing repository boundaries                                            | Existing audited commands remain best effort after success | None currently                                    |
| Delivery creation                    | Delivery and optional shipping charge/totals/payment state                | No new audit introduced                                    | DELIVERY_CREATED in the same transaction          |
| Delivery status                      | Existing update                                                           | Best effort after success                                  | None currently                                    |
| Auth                                 | Existing authentication persistence                                       | HTTP outcome logs, no new business audit                   | None currently                                    |

Not every existing mutation emits an audit record. Coverage is unchanged except known
entity IDs added to existing creation audits. There is no new mandatory audit_logs writer:
critical histories/ledgers and the listed outbox events are required transactional records.
A crash after commit can still lose a best-effort audit.

## Audit port and context

Application services inject AUDIT_PORT / AuditPort, an explicit best-effort contract
owned by Audit domain. AuditService implements it using the existing AuditRepository.
The already-global AuditModule exports the token with useExisting, not a second instance.
The Audit controller still uses its own application service. No event bus is introduced.

Middleware initializes native AsyncLocalStorage around next(). Immutable context contains
only the existing request ID, validated Express request.ip and optional bounded User-Agent.
It never stores actor/tenant, requests, services or permissions. Audit preserves the
explicit authenticated shop/user/member supplied by the application. Background calls
work without context. Request IDs retain the existing 1-100 ASCII letter/digit/\_/- policy
and response header; they are correlation labels, not authenticated identities.

IP uses Express trust semantics, never raw X-Forwarded-For parsing. Deployment-specific
trusted proxies are not configured here. User-Agent is untrusted informational metadata,
stripped of controls, bounded to 512 characters and scrubbed for common credential patterns.
Audit snapshots redact credential keys and common Bearer/JWT/URL credentials, with depth,
array and string bounds. Existing customer PII is not expanded. Arbitrary settings values
are omitted because secrets cannot reliably be identified by setting name. Failure logs
contain action/entity/shop/request IDs, not snapshots or raw exception text. Free-form
text cannot be guaranteed secret-free; callers must select minimal semantic fields.

## Outbox

Feature-owned event types constrain existing rental/payment/delivery payloads with
satisfies at their Prisma inserts. Names, payloads and transaction placement are unchanged.
Outbox insertion failure rejects the owning transaction. Rental replay bypasses creation,
so it produces neither a second event nor a second business audit.

There is currently no dispatcher or consumer. The guarantee is atomic durable pending
records, not external delivery. A future dispatcher needs worker claiming, retry and
idempotent consumption. Do not promise exactly-once delivery. Cleanup and retention jobs
remain separate work.

## Fenced idempotency

Rental creation supports fenced claims for both Admin and Web scopes. Identity remains
`(shopId, scope, key)`, backed by the existing unique index. Admin keeps its existing
optional `rental-order.create` protocol and serialized detail replay. Web requires an
opaque `Idempotency-Key` in `web-rental-order.create.v1` and stores only its public
creation snapshot; see [Web order idempotency](WEB_ORDER_IDEMPOTENCY.md). Different
payloads conflict before replay or stale recovery.

- Retention keeps the existing expiresAt supplied by the service (24 hours). Expired keys
  remain reusable; this is not indefinite deduplication.
- Processing lease is a centralized five-minute constant, independent of retention.
  Existing createdAt represents current claim acquisition time. Clock is injected into
  the Rental Prisma adapter for deterministic expiry/stale decisions.
- CLAIMED returns internal claimId, the existing row UUID. Recovery conditionally updates
  old ID, tenant/scope/key, hash, incompletion and createdAt <= now - lease. The winner
  rotates UUID and acquisition time and uses the retry's retention deadline. No relation
  references this row ID; no idempotency schema field is needed.
- Before any order write, the Serializable transaction conditionally UPDATEs the matching
  owner row, acquiring a PostgreSQL row lock until commit/rollback. Token mismatch rejects
  before creation. A SELECT availability check is not an ownership lock.
- Recovery and expiry deletion contend with the same row lock. If execution commits,
  recovery rechecks and sees completion; if recovery wins first, the old token cannot
  write, complete or delete the successor. Existing P2034 retries and inventory exclusion
  protection remain intact.
- Completion checks ownership inside the same transaction as order/outbox. Failure rejects
  the transaction. Cleanup deletes only the caller's incomplete token. Cleanup failures
  are logged without replacing the original error; stale recovery remains available.
- Contention is bounded to three inspections. Active/contended claims retain in-progress
  409 behavior; ownership loss uses the same in-progress message. Failures are not cached
  as completed responses. Recovery logs omit keys, hashes and response payloads.

The fence, not timeout alone, prevents stale execution. There is no heartbeat and no
assumption that an old lease proves a process dead. Lock waits retain existing DB/transaction
settings. Helpers consume an infrastructure-local projection of the four required Prisma
operations, supplied by the existing client or transaction, without owning connections.

## Failure windows

| Window                                   | Outcome                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Before claim                             | No idempotency/business write                                             |
| After claim, before business transaction | Incomplete row; fenced recovery after five minutes                        |
| During transaction / outbox failure      | Transaction rolls back order/outbox/completion; cleanup or later recovery |
| After order insert, before completion    | Same uncommitted transaction, no separately committed order               |
| After commit, before response            | Replay stored completion, no repeated order/outbox/audit                  |
| Old process resumes after recovery       | Token mismatch blocks writes; old cleanup cannot remove successor         |

Guarantees require all writers to use the fence. Manual DB edits and malformed replay JSON
are not repaired; the existing narrow serialized-response assertion remains. No unrelated
order is guessed to be a stale request's result by matching a business reference.

## Deployment

Only schema change: audit_logs.request_id UUID -> VARCHAR(100), in migration
202609110001_audit_request_id_text. Middleware already accepts non-UUID IDs. Widening
preserves existing UUID strings and stores the same correlation ID instead of failing
inserts or generating a second ID. Apply this migration before new audit enrichment.
There are no idempotency/outbox schema changes.

Manual Admin receipts use the same fenced record table with their own actor-scoped
`finance.manual-payment.create.v1:<memberId>` namespace. Their 30-day result
retention, stable omitted-`paidAt` marker, transactional audit and caller rollout are
documented in [Manual receipt idempotency](MANUAL_RECEIPT_IDEMPOTENCY.md).

Drain/stop all old backend instances and in-flight rentals before enabling recovery.
Old code completes/releases by key without fencing; a mixed-version rolling deployment
is unsafe. Likewise drain new work before rolling back to an unfenced implementation.
Legacy incomplete claims may be recovered once no old executor remains.

Run npm run db:generate during preparation and npm run db:migrate against the verified
deployment database. Startup does not apply this change automatically. A locked Windows
Prisma engine DLL requires releasing the process holding that DLL before generation;
do not terminate unrelated processes automatically.

## Verification limits

Tests cover audit enrichment/isolation/failure, typed AuditPort, same-key/tenant/hash/replay,
atomic compare-and-swap claim races, old-token fencing, and transaction ordering/error
propagation. The small in-memory claim model is not PostgreSQL: it does not prove lock
waits, unique-index arbitration, real rollback or cross-process execution. The repository
has no PostgreSQL integration/e2e harness; tests do not mutate a live database. Add actual
DB contention, crash-window and outbox rollback checks when that harness exists.
