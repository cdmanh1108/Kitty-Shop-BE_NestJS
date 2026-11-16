# Business types and persisted values

## Vocabulary ownership

| Concept | Owner |
| --- | --- |
| Rental lifecycle, order item and allocation state | `rentals/domain` |
| Rental charge type | `rentals/domain/charge-type.ts` |
| Order payment, transaction and expense state | `finance/domain` |
| Product and inventory state | `catalog/domain/catalog-status.ts` |
| Delivery state, direction and method | `deliveries/domain` |
| Customer state | `customers/domain/customer-status.ts` |

Status columns intentionally remain `VARCHAR` where the application supports
persisted values beyond a closed PostgreSQL enum. Do not narrow a read type with
an assertion or invent a fallback for an unknown stored value. Rental `OVERDUE`
is derived from the schedule; it is not a separate lifecycle status.

## Money and pricing

- PostgreSQL money columns use `NUMERIC(18,2)` and Prisma `Decimal`.
- Rental cycle arithmetic uses integer cents internally. The API keeps its
  established numeric fields; persisted order items retain the amounts charged.
- Deposits are held money, not rental revenue. `calculateOrderPaymentState`
  owns transaction-history payment and deposit state.
- Rental policy exposes two editable shop prices: the first cycle price and the
  additional-day fee. Quantity threshold, renewal days, and the online duration
  limit are release rules owned by backend code.
- A paid order item stores a complete `CYCLE_V1` snapshot with the effective
  policy and any order/item override. A complimentary line stores
  `FREE_ACCESSORY_V1`; unknown or incomplete versions are rejected.
- Product catalog rows do not contain rental-rate schedules. Quotes and new
  orders calculate prices from the shared cycle policy. Historical amounts are
  read from the order item snapshot, never from today's catalog or settings.

For a duration `d` and renewal day `r`, the cycle length is `r - 1` days:

```text
cycleCount = 1 + floor((d - 1) / (r - 1))
additionalDayCount = d - cycleCount
unitRentalPrice = cycleCount * cyclePrice + additionalDayCount * additionalDayFee
```

Defaults are 50,000 VND per cycle and 10,000 VND per additional day. Orders with
at least three paid physical units use the longer renewal interval. Complimentary
accessories do not contribute to that quantity and carry zero rental and deposit.

## Date and time

Rental requests and persisted rental periods use full timestamps with timezone
offsets. User-facing shop time is Vietnam time (`UTC+07:00`). Date-only API
values are invalid; see [web rental input validation](WEB_RENTAL_INPUT_VALIDATION.md).

## Complimentary accessory rules

`Product.allowFreeAccessory` is the catalog eligibility flag and is independent
of category. An order item captures that eligibility. A free line is valid only
when eligibility is true and rental price, deposit, discount, and line total are
zero. Paid and free selections of the same variant remain distinct order lines.

## Application and database checks

Application validation gives safe domain errors. The initial-release migration
also retains PostgreSQL checks for core money, quantity, profile, order, payment,
settlement, and pricing invariants. The GiST exclusion constraint on
`RentalItemAllocation` protects overlapping reservations for the same physical
item even under concurrent booking transactions.
