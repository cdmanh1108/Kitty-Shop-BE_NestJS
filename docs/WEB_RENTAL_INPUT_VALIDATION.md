# Web rental input validation

## Scope

C25 validates the Web availability, quote, and order-create inputs before
catalog selection, policy pricing, customer resolution, or an idempotency claim.
The availability endpoint requires a selected variant. It does not change
payment-method handling (C26), stock eligibility (C08/C09), customer resolution
(C13), or idempotency semantics (C14).

## Selection and limits

Each rental line must provide a `variantId`. `productId` is optional and, when
provided, must match the selected variant's parent. A mismatch is a `400`.

The following are new technical resource limits, not catalog, inventory, or
pricing policy:

| Input                                                            |          Limit |
| ---------------------------------------------------------------- | -------------: |
| Raw item lines                                                   |             20 |
| Quantity per line                                                |             20 |
| Total quantity, including duplicate lines before/after merge     |             50 |
| Delivery address / social contact text                           | 500 characters |

Quantities remain required integers; the API never defaults an omitted quantity
to one. Duplicate variant lines remain supported and are merged before pricing
and allocation.

## Dates and delivery

New availability, quote, and create requests use ISO 8601 date-times with an
explicit timezone. The storefront and admin interpret entered times as Vietnam
time (`Asia/Ho_Chi_Minh`, UTC+07:00), then send timezone-aware timestamps. The
backend compares those exact instants.

For clients being upgraded, legacy `YYYY-MM-DD` values remain accepted and are
interpreted as 08:30 in Vietnam, the shop opening time. Calendar rollover dates
such as `2026-02-30`, timestamps without a timezone, and non-zero-padded dates
are rejected. Pickup must be strictly before return.

Create requires object-valued `customer` and `delivery`. Customer names cannot
be blank after whitespace inspection. `shop_delivery` requires a nonblank,
maximum-500-character address. `self_pickup` may omit the address, but a
supplied address still has type, nonblank, and length validation. Blank/null
email remains compatible with the existing customer resolver; a nonblank email
must be syntactically valid and at most 255 characters.

Consumers must send UUID product/variant identifiers, an explicit quantity,
timezone-aware rental timestamps, and a delivery address whenever selecting
`shop_delivery`.
