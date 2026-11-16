# Accessory rental rules

## Billing and entitlement

`Product.allowFreeAccessory` controls complimentary eligibility independently of category. `RentalOrderItem.billingRole` captures the
agreed rental role independently: `PAID` or `FREE_ACCESSORY`. Omitted input is paid.
Each paid physical unit earns one free accessory, including standalone paid
accessories and paid lines with an explicit zero price. Free accessories do not
earn more free accessories or count toward the cycle-pricing quantity tier.

The allowance is shared across the order and is based on quantity, not line count.
Customers explicitly choose the accessories. Excess units are explicitly paid;
the backend rejects requests claiming more free units than allowed, rather than
silently changing their price. Only a shop-scoped bookable variant whose Product has `allowFreeAccessory=true`
can receive the free role. Paid accessories use ordinary pricing and deposit.

Admin create, Web quote and Web checkout item inputs accept optional `billingRole`.
For example, two paid units allow up to two selected free units:

```json
{
  "items": [
    { "variantId": "<paid-variant-uuid>", "quantity": 2 },
    { "variantId": "<accessory-variant-uuid>", "quantity": 2, "billingRole": "FREE_ACCESSORY" }
  ]
}
```

A variant can appear in both roles, with distinct physical allocations. Admin
rejects repeated variant/role combinations; Web merges them within each role.
Quotes return role-specific line totals and an `accessoryAllowance` containing
paid quantity, selected free quantity and remaining entitlement. Item price
overrides are rejected on free lines; order overrides apply to paid lines only.

## Persistence, availability and lifecycle

Order lines capture `billing_role` and `allow_free_accessory_snapshot`; free lines
use `FREE_ACCESSORY_V1` pricing snapshots with zero rent and deposit. Catalog
edits cannot change an existing line's role. The persisted model does not use a
product-kind snapshot.

Preflight checks total physical demand across paid and free roles. Creation
allocates different SKU IDs and revalidates entitlement, pricing, catalog eligibility,
shop ownership, rentability and availability inside the existing Serializable
transaction. The unchanged PostgreSQL exclusion constraint prevents overlap.
Order, allocations, outbox and idempotency completion stay in that transaction.

Free accessories reserve the complete rental interval and take part in confirmation,
handover, reschedule, cancellation, return inspections and release. Current
automatic return fees exclude their quantity; damage/loss inspection charges are
preserved. Return fees use saved cycle pricing and support reasoned per-SKU overrides;
see [Return fees](RENTAL_RETURN_FEES.md).

Web idempotency includes the normalized billing role for every item. Because the
release starts with an empty database, there are no prior checkout claims to
preserve. A completed request replays before policy/catalog reads and cannot
book accessories twice.

## Release schema and frontend integration

The single initial-release baseline includes the eligibility flag and order-line
snapshot. A new database has no historical catalog values to backfill. See
[Database](DATABASE.md) and [Runbook](RUNBOOK.md) for release setup. Admin and Web
contracts expose the same paid/free selection behavior.

## Storefront cart integration

Account cart items accept optional `billingRole`, defaulting to paid when absent. JSON cart storage preserves the role and permits the same variant in separate paid/free rows. Version conflict handling and shop/account ownership remain unchanged. Guest cart state is local to the browser and is not merged into an account cart.

The cart is editable intent, so reducing paid quantity may temporarily exceed the free allowance. Cart persistence keeps that explicit choice; quote and booking continue to enforce canonical accessory eligibility, entitlement, combined physical demand and booking safety. Web checkout blocks until the customer removes excess accessories or explicitly chooses paid rental.

The Catalog and Favorites DTOs publish `allowFreeAccessory`. Detail and selection resolution provide the canonical flag for complimentary eligibility. Accessory selectors query `allowFreeAccessory=true`; a false product remains available in normal paid catalog selection. The flag alone never waives charges: only a validated FREE_ACCESSORY role does. Regenerate both frontend OpenAPI/schema snapshots after this contract change.
