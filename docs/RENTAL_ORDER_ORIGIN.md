# Rental order source and storefront ownership

`rental_orders.source` is required immutable creation provenance:

- `ONLINE`: created through the authenticated storefront checkout with a
  verified-email WebAccount.
- `OFFLINE`: created through the Admin/manual rental flow.

The source is independent from CRM identity. `customer_id` remains the shop's
CRM renter record; `web_account_id` records storefront ownership. Deleting a
WebAccount preserves the order and its source while clearing only the optional
account relation. Notification email remains the address captured at checkout.

## Write boundary

Only trusted backend services choose the source. `WebRentalOrderService` writes
`ONLINE`; `RentalCreationService` writes `OFFLINE`. Transport DTOs do not accept
the source, account owner or notification email. The storefront route requires
an authenticated account, and booking rechecks enabled status and verified
email inside the transaction before persisting the account relation and email.

Checkout idempotency is scoped to the authenticated account. A key cannot replay
one account's order to another account. See [Web order idempotency](WEB_ORDER_IDEMPOTENCY.md).

## Account order history

`GET /web/account/rental-orders` and
`GET /web/account/rental-orders/:orderCode` query by the verified
`WebAccount.id` and `source = ONLINE`; they never infer ownership from CRM
customer, phone or email. A detail request for another account's order, an
offline order or an unknown code returns the same 404. The response omits CRM,
staff, inventory-allocation, payment-ledger and internal-note data.

`POST /web/account/rental-orders/:orderCode/cancel` uses the canonical
transactional rental lifecycle. It is available only to the verified owner of
an `ONLINE`, `RESERVED`, unpaid order with no held deposit. Foreign and
unavailable orders return the same 404. Cancellation records the WebAccount
audit actor and cannot use staff actor fields.

## Persistence

The initial-release baseline requires an order source and creates the nullable
account relation for deletion-safe ownership. New orders always set their source
explicitly; no source is inferred from customer contact information.
