# Return fees and per-item overrides (RP13)

Formal rental extension (RP11/RP12) is no longer part of this rollout. An active
order keeps its agreed due time; return processing calculates overtime charges.
The existing schedule correction endpoint still preserves the priced duration.

## Continuous pricing

New `CYCLE_V1` agreements use their saved policy, paid-unit quantity tier and
effective cycle price. Catalog changes and current shop pricing do not reprice
an existing agreement. Duration uses elapsed 24-hour days rounded up, from the
agreed rental start to the actual return timestamp. Returning early never reduces
the booking price. If a late return stays within the same already-priced rounded
day, the additional configured price is zero.

The automatic fee for each physical SKU is the configured total at actual return
minus the original configured total. It is split into:

- `lateFee`: new non-renewal days multiplied by the saved daily surcharge.
- `additionalRentalFee`: new renewal days multiplied by the saved cycle price,
  including the original item/order price override, even when that price is zero.

At the defaults, a paid unit in an order below three paid units going from day 4
to day 5 incurs 50,000, and from day 5 to day 6 incurs 10,000. With at least three
paid units, day 7 to day 8 incurs 50,000. Renewal days do not also incur 10,000.
Free units never increase the quantity tier and always incur zero time fees.

`LEGACY_RATE_V1` and unversioned historical agreements retain the previous return
policy (per-day fee plus a new full rental charge at its threshold). They are not
backfilled into cycle agreements. Unknown/corrupt explicit snapshots fail safely.

## Receive return

`GET /admin/rental-orders/:id/return-preview?returnedAt=<ISO timestamp>` requires
`rentals.return`. It returns the configured fee breakdown per SKU, rounded rental
durations and a `feePreviewToken`. Only ACTIVE orders can be previewed. The read
uses currently unreleased ACTIVE allocations; free and paid roles share normal
physical inspection/release rules.

`POST /admin/rental-orders/:id/return` accepts an optional fee override and optional
inspection/compensation charge on each existing inspection:

```json
{
  "actualReturnedAt": "2026-10-12T03:00:00.000Z",
  "feePreviewToken": "<token from the matching return preview>",
  "inspections": [{
    "inventoryItemId": "<SKU inventory UUID>",
    "condition": "DAMAGED",
    "lateFeeOverride": { "amount": 0, "reason": "Cửa hàng miễn phí trả trễ" },
    "charge": { "chargeType": "DAMAGE", "amount": 150000, "reason": "Rách vải" }
  }]
}
```

An override replaces the SKU's complete time fee, rather than adding to it. An
explicit zero waives that fee; an omitted override uses the computed amount.
Every override needs a trimmed, nonempty reason of at most 2,000 characters.
Money, including inspection compensation, must be finite, nonnegative and have
at most two decimal places. Admin money inputs continue to use whole VND.

Free accessories reject time-fee overrides. They may receive REPAIR, DAMAGE or
LOST_ITEM compensation; the inspection still applies even when their rent and
deposit are zero. Ordinary items also permit CLEANING inspection charges. General
manual charges remain available, but LATE/RENTAL_EXTRA must use the SKU time-fee
override to avoid charging twice. Manual charge quantities are respected.

The write locks the shop-scoped order inside a Serializable transaction and
revalidates status, allocated SKU identities, fee snapshots, overrides and an
optional preview token. Fees, per-SKU charges, inspection snapshots, allocation
release, order totals, payment state, audit and outbox commit together. A stale
preview produces `RENTAL_FEE_PREVIEW_CHANGED`; retry reads before submitting again.

## Adjust fees at settlement

`POST /admin/rental-orders/:id/settlement-preview` requires `rentals.settle` and
accepts `feeOverrides: [{ inventoryItemId, amount, reason }]`. It is a read despite
using POST for a structured body. It returns per-SKU configured/current/agreed
fees, a freshness token, totals and collection/refund amounts from the real ledger.
It never changes fees or records a payment.

The existing multipart `POST /admin/rental-orders/:id/settle` accepts that override
array as JSON in the `feeOverrides` field and the corresponding `feePreviewToken`.
The token is mandatory when overriding fees. The transaction recomputes the
preview before recording any adjustment or receipt. Old clients omitting both
fields remain compatible.

Only RETURNED, unsettled orders may be adjusted. Original configured fee columns
stay unchanged; the agreed columns/reason are updated before final settlement.
Previous SKU time-charge rows are voided, replacement rows are created, and a
transactional `RETURN_ITEM_FEE_OVERRIDE` audit preserves old/new amounts and reason.
No inspection/compensation charge or original booking snapshot is removed.

Reducing fees below already-paid rental money refunds that excess separately as
`OUT ORDER_REFUND` (`RS-O-*`). Deposit refunds remain `OUT DEPOSIT_REFUND`
(`RS-F-*`); deposits are never revenue. Both receipts and the final settlement share
the transaction. Lifecycle receipts remain protected from generic voids.

## Persistence and deployment

Migration `202610060003_return_item_fees` adds nullable configured/agreed fee,
reason and pricing-version fields to `rental_return_inspections`. Existing returns
remain NULL, without inventing historical per-SKU amounts. These old return records
cannot use per-SKU settlement overrides; their existing settlement still works.

Apply the migration before running the new writers, then regenerate Prisma Client.
No live database migration is run by the implementation task. Export BE OpenAPI
and sync the Admin contract; the storefront contract is unchanged.

Admin receive-return and settlement dialogs expose explicit per-SKU overrides,
require reasons, show compensation separately and retain input on errors. Settlement
money comes from its backend preview. Queries cancel on changed input/dialog close,
debounce fee drafts, and never show a previous draft's money as current. Mutation
retries remain manual; refresh failures only retry reads.
