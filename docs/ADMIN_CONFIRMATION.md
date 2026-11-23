# Admin rental confirmation

Admin creates a `RESERVED` booking, then submits confirmation from Order Detail.
`POST /api/v1/rental-orders/:id/confirm` records actual receipts as PaymentTransactions,
together with confirmation, audit and outbox. Rental and deposit receipts are separate.
Only the difference from existing net receipts is collected; the confirmation snapshot
is never added to ledger totals. Confirmation means awaiting handover; `/start` records
actual handover separately, including for bookings paid in advance.

## Contract and authorization

All confirmation endpoints require `rentals.confirm` and scope the order to the
authenticated shop. The initial seed grants this permission to OWNER and
MANAGER roles.

- `GET /rental-orders/:id/confirmation-options`: expected deposit, image size and MIME limits.
- `POST /rental-orders/:id/confirm`: multipart fields `collateralAmount` for the
  actual deposit received, optional `note` (2,000 characters) and `evidence` image.
  Optional `paymentMethod` is CASH or BANK_TRANSFER (defaults to CASH).
  Actual CASH deposit may be below the suggested amount, including zero, up to
  100,000,000. The suggested amount is not an unpaid balance. Existing recorded
  deposits cannot silently be reduced; reconcile/refund those receipts first.
  Returns Order Detail with nullable `confirmation` metadata.
- `GET /rental-orders/:id/confirmation/evidence`: authenticated binary download,
  `Cache-Control: private, no-store`. No object key or provider URL is exposed.

Only RESERVED can be confirmed. Repeated/concurrent confirmation has one winner;
other attempts fail without duplicate records. Generic repository transitions to
CONFIRMED are rejected.

## Persistence and evidence

The database schema has one `rental_confirmations` row per order. It snapshots
actor, time, rental amount, cash deposit, note and optional image metadata. The
initial-release baseline creates this table and enforces foreign keys,
nonnegative amounts, a required deposit amount, and complete evidence
metadata in PostgreSQL.

A serializable transaction writes confirmation, order/item/allocation states,
status history, the existing AuditLog and outbox together. Confirmation audit is
required in this transaction; other application audit operations retain their
existing best-effort behavior. Inventory exclusion constraints remain intact.

Evidence reuses ObjectStoragePort and the S3-compatible adapter. Configure
`OBJECT_STORAGE_PRIVATE_BUCKET` to a **separate bucket with public access disabled**
by the provider; use the existing endpoint and credentials with access to both
buckets. Private keys cannot resolve to public URLs. Without this setting,
confirmation without evidence still works and private uploads fail closed.
Do not configure a public domain/CDN for the private bucket.

Uploads accept JPEG/PNG/WebP/GIF, maximum 15 MiB, with content/MIME checks. Storage
contains bytes; PostgreSQL contains only key, sanitized filename, MIME and size.
An upload precedes the DB transaction; failures clean up the new object after
checking it is not referenced by a committed confirmation. An ambiguous DB result
retains evidence when cleanup cannot establish ownership. Process termination
can leave an unreferenced private object; retention cleanup must check DB
references before deleting anything. Never expire referenced evidence blindly.

## Receipt provenance

Receipts distinguish staff-entered `ADMIN_MANUAL` payments from internal deposit
offsets (`INTERNAL_TRANSFER`). A manual bank transfer means staff verified the
transfer; it is not a webhook. Confirmation and settlement receipt keys are
deterministic and unique per order. Actor, time, note and protected evidence
provide the audit trail.

## Settlement

Settlement uses net ledger receipts. Unpaid rental/charges = grand total minus net
rental payments; deposit held = deposits in minus deposits out. Excess deposit is
refunded, or the shortfall collected. Applied deposit creates an INTERNAL_TRANSFER
pair (deposit OUT, rental IN), changing revenue classification without inventing
an external cash movement. Actual collection/refund uses the selected payment method.
Settlement, receipts, order state, audit and outbox commit atomically.

The fresh-release database starts without historical receipts or settlements.
Signed refunds remain separate ledger movements and settlement uses the net
verified receipts.
