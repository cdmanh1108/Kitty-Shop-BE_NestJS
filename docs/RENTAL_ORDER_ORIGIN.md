# Rental order origin and storefront ownership

`rental_orders.source` is immutable creation provenance, not authentication state:

- `ONLINE`: created through the storefront checkout, including guest checkout.
- `OFFLINE`: entered through an Admin/manual order path.

`rental_orders.web_account_id` is nullable storefront ownership. It is separate from
`customer_id`, which remains the shop CRM renter identity. An ONLINE guest order and
an OFFLINE Admin order both have `web_account_id = NULL`.

## Write boundary

Only trusted backend application services choose the source. `WebRentalService` always
writes `ONLINE`; `RentalService` always writes `OFFLINE`. Neither Admin nor storefront
request DTO accepts source or web-account ownership, and no update command changes it.

The checkout controller uses optional Web JWT authentication. A missing access cookie is a
guest checkout and writes `web_account_id = NULL`; a valid cookie writes the verified
`WebAccount.id` in the same order-creation transaction. An expired or invalid supplied
cookie is rejected rather than silently downgraded to guest. The idempotency command hash
also includes the stable owner scope (`guest` or the account ID), never a raw token, so a
key cannot replay one owner's order to another owner.

Account order-history APIs and historical guest-order claiming remain separate features.

## Legacy migration

Migration `202609280003_rental_order_source_web_account` adds a nullable enum source,
a nullable WebAccount foreign key (`ON DELETE SET NULL`), and the future
`(web_account_id, created_at DESC)` history index. It does not backfill existing orders:
their creation channel cannot be proven from customer, phone, email, or absent account
data. There is deliberately no default and no guessed `ONLINE`/`OFFLINE` classification.

Deploy the migration before the application version that writes the new fields. Legacy
rows may remain `source = NULL`; all new application-level creates set an explicit source.
