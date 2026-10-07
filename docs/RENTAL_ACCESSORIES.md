# Accessory rental rules (RP08)

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

New lines capture `billing_role` and `allow_free_accessory_snapshot`; free lines use
`FREE_ACCESSORY_V1` pricing snapshots with zero rent and deposit. Historical lines
are backfilled as paid. Catalog edits cannot change an existing line's role. Legacy `product_kind_snapshot` values are retained only on old lines; new lines leave that column null.

Preflight checks total physical demand across paid and free roles. Creation
allocates different SKU IDs and revalidates entitlement, pricing, catalog eligibility,
shop ownership, rentability and availability inside the existing Serializable
transaction. The unchanged PostgreSQL exclusion constraint prevents overlap.
Order, allocations, outbox and idempotency completion stay in that transaction.

Free accessories reserve the complete rental interval and take part in confirmation,
handover, reschedule, cancellation, return inspections and release. Current
automatic return fees exclude their quantity; damage/loss inspection charges are
preserved. RP13 implements cycle-based return fees and reasoned per-SKU overrides;
see [Return fees](RENTAL_RETURN_FEES.md). Formal extension APIs are no longer planned.

Web idempotency includes free/paid intent. Paid-only hashes retain their previous
identity, so deployment does not invalidate completed legacy checkout retries.
Replay happens before policy/catalog reads and never books the accessories twice.

## Deployment and frontend integration

Apply all migrations including `202610070001_free_accessory_eligibility` and regenerate Prisma
Client before running the updated backend. That migration preserves eligibility of old ACCESSORY products, removes Product.kind, and leaves old rental snapshots unchanged. No live database migration is performed
by this task. OpenAPI is exported and both frontend schemas are regenerated.
Admin and Web accessory-selection interfaces are implemented in RP09/RP10.

## Storefront cart integration (RP10)

Account cart items now accept optional `billingRole`, defaulting to paid when absent. The existing JSON cart storage preserves the role and permits the same variant in separate paid/free rows. Version conflict handling and shop/account ownership remain unchanged. No new migration or guest-to-account merge is introduced.

The cart is editable intent, so reducing paid quantity may temporarily exceed the free allowance. Cart persistence keeps that explicit choice; quote and booking continue to enforce canonical accessory eligibility, entitlement, combined physical demand and booking safety. Web checkout blocks until the customer removes excess accessories or explicitly chooses paid rental.

The Catalog and Favorites DTOs publish `allowFreeAccessory`. Detail and selection resolution provide the canonical flag for complimentary eligibility. Accessory selectors query `allowFreeAccessory=true`; a false product remains available in normal paid catalog selection. The flag alone never waives charges: only a validated FREE_ACCESSORY role does. Regenerate both frontend OpenAPI/schema snapshots after this contract change.
