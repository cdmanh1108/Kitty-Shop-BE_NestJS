# Web rental input validation

## Scope

C25 validates the Web availability, quote, and order-create inputs before
catalog selection, policy pricing, customer resolution, or an idempotency claim.
It does not change payment-method handling (C26), stock eligibility (C08/C09),
customer resolution (C13), or idempotency semantics (C14).

## Selection and limits

`productId` and `variantId` are UUIDs when supplied. A request may supply either
one, or both: the C09 resolver accepts product-only only when it resolves to
exactly one public eligible variant, and accepts a pair only when the variant
belongs to that product. A mismatched pair is a `400`; unavailable or ambiguous
public selections retain their endpoint-specific availability/not-found behavior.

The following are new technical resource limits, not catalog, inventory, or
pricing policy:

| Input                                                            |          Limit |
| ---------------------------------------------------------------- | -------------: |
| Raw item lines                                                   |             20 |
| Quantity per line                                                |             20 |
| Total quantity, including duplicate lines before/after C09 merge |             50 |
| Delivery address / social contact text                           | 500 characters |

Quantities remain required integers; the API never defaults an omitted quantity
to one. Duplicate variant lines remain supported and are merged by C09.

## Dates and delivery

Dates must be `YYYY-MM-DD` and be real UTC calendar dates. Rollover dates such
as `2026-02-30`, timestamps, and non-zero-padded dates are rejected. The same
date-only parser is used by availability, quote, and create; pickup must be
strictly before return.

Create requires object-valued `customer` and `delivery`. Customer names cannot
be blank after whitespace inspection. `shop_delivery` requires a nonblank,
maximum-500-character address. `self_pickup` may omit the address, but a
supplied address still has type, nonblank, and length validation. Blank/null
email remains compatible with the existing customer resolver; a nonblank email
must be syntactically valid and at most 255 characters.

No migration is needed. Consumers must send UUID product/variant identifiers,
an explicit quantity, and a delivery address whenever selecting `shop_delivery`.
