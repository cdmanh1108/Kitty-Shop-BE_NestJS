# Rental order origin and storefront ownership

`rental_orders.source` is immutable creation provenance, not authentication state:

- `ONLINE`: created through the storefront checkout, including guest checkout.
- `OFFLINE`: entered through an Admin/manual order path.

`rental_orders.web_account_id` is nullable storefront ownership. It is separate from
`customer_id`, which remains the shop CRM renter identity. An ONLINE guest order and
an OFFLINE Admin order both have `web_account_id = NULL`.

## Write boundary

Only trusted backend application services choose the source. `WebRentalOrderService` always
writes `ONLINE`; `RentalCreationService` always writes `OFFLINE`. Neither Admin nor storefront
request DTO accepts source or web-account ownership, and no update command changes it.

The checkout controller uses optional Web JWT authentication. A missing access cookie is a
guest checkout and writes `web_account_id = NULL`; a valid cookie writes the verified
`WebAccount.id` in the same order-creation transaction. An expired or invalid supplied
cookie is rejected rather than silently downgraded to guest. The idempotency command hash
also includes the stable owner scope (`guest` or the account ID), never a raw token, so a
key cannot replay one owner's order to another owner.

## Account order history

Authenticated account history is available only through `GET /web/account/rental-orders`
and `GET /web/account/rental-orders/:orderCode`. Both queries are scoped in persistence by
the verified `WebAccount.id` **and** `source = ONLINE`; they never infer ownership from a
CRM customer, phone number, or email address. An order absent from that scope (including a
guest checkout, an OFFLINE order, another account's order, and an unknown code) has the same
404 response on the detail endpoint. The list uses descending `created_at`, then `id`, and
the projection intentionally omits CRM, staff, inventory-allocation, payment-ledger, and
internal-note data.

Historical guest-order claiming remains a separate feature.

## Account self-cancellation

`POST /web/account/rental-orders/:orderCode/cancel` uses the same transactional
rental lifecycle as the Admin cancellation command. It is available only to the
verified owner of an `ONLINE` order that is still `RESERVED`, has no completed
payment-ledger entries, and has no held deposit. Guest, OFFLINE, foreign, and
unknown orders return the same 404 response.

The transition locks the rental monetary boundary before checking payment state,
then cancels unreleased allocations and items, records status history with reason
`WEB_USER_CANCELLED`, cancels only delivery jobs that can safely transition from
`PENDING` or `READY`, and emits the normal cancellation outbox event in one
serializable transaction. A stale concurrent confirmation, payment, delivery, or
second cancellation therefore cannot produce a cancelled order with an active
payment or duplicate lifecycle history. The separate best-effort audit record
uses `audit_logs.actor_web_account_id`; it never overloads staff actor fields.

## Legacy migration

Migration `202609280003_rental_order_source_web_account` adds a nullable enum source,
a nullable WebAccount foreign key (`ON DELETE SET NULL`), and the future
`(web_account_id, created_at DESC)` history index. It does not backfill existing orders:
their creation channel cannot be proven from customer, phone, email, or absent account
data. There is deliberately no default and no guessed `ONLINE`/`OFFLINE` classification.

Deploy the migration before the application version that writes the new fields. Legacy
rows may remain `source = NULL`; all new application-level creates set an explicit source.
