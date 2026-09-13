# Admin rental confirmation

Admin creates a `RESERVED` booking, then submits confirmation from Order Detail.
`POST /api/v1/rental-orders/:id/confirm` records the staff acknowledgement that
the shop received the rental amount outside the system and holds the collateral.
It does not call the Payment API or create a PaymentTransaction. Payment balances
and revenue remain derived from the existing transaction ledger.

## Contract and authorization

All confirmation endpoints require `rentals.confirm` and scope the order to the
authenticated shop. The migration grants this permission to existing OWNER and
MANAGER roles; the seed grants it to those roles for new installations.

- `GET /rental-orders/:id/confirmation-options`: policy methods/document types,
  order expected deposit, image size and MIME limits.
- `POST /rental-orders/:id/confirm`: multipart fields `collateralMethod`
  (`CASH` or `DOCUMENT`), `collateralAmount` for CASH, `documentType` (`CCCD` or
  `GPLX`) for DOCUMENT, optional `note` (2,000 characters) and `evidence` image.
  CASH must meet the order's expected deposit and the existing monetary limits.
  Returns Order Detail with nullable `confirmation` metadata.
- `GET /rental-orders/:id/confirmation/evidence`: authenticated binary download,
  `Cache-Control: private, no-store`. No object key or provider URL is exposed.

Only RESERVED can be confirmed. Repeated/concurrent confirmation has one winner;
other attempts fail without duplicate records. Generic repository transitions to
CONFIRMED are rejected. The separate collateral receive endpoint was removed;
document return after completion remains available.

## Persistence and evidence

Migration `202609130001_admin_rental_confirmation` adds `rental_confirmations`,
one row per order. It snapshots actor, time, rental amount, collateral, note and
optional image metadata. Foreign keys, nonnegative amounts, valid collateral
combinations and complete evidence metadata are enforced in PostgreSQL.

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

## Future Sales Web

Online checkout may record real PaymentTransactions and verify provider events in
its own authorized use case. Do not infer paid ledger balances from the manual
confirmation snapshot, turn evidence into a payment, or reopen a generic status
bypass. Manual acknowledgement and ledger payments represent different facts;
any future reconciliation should explicitly prevent double counting.
