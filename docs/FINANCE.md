# Finance

## Recognition rules

Finance reports recognized revenue from rental orders that reached `COMPLETED`,
using `completedAt`, minus paid, nonvoided operating expenses on their business
date. `RESERVED`, `CONFIRMED`, `ACTIVE`, `RETURNED`, `CANCELLED`, and orders
without `completedAt` do not contribute revenue. Completion is performed by the
existing settlement flow.

This is distinct from Dashboard and Reports cash-ledger metrics. Deposit
movements, collateral, settlement refunds and additional collections are not
additional revenue or expenses. Do not add payment acknowledgements to revenue.

| Entry | Finance treatment |
| --- | --- |
| Rental after discount | `grandTotal - chargesTotal`, recognizing the finalized order total once. |
| Additional rental | Nonvoided `RENTAL_EXTRA` charge, amount × quantity. |
| Accessory | Explicit `ACCESSORY` charge; never infer from product names. |
| Late fee | `LATE` charge. |
| Cleaning/damage | `CLEANING`, `REPAIR`, `DAMAGE`, and `LOST_ITEM` charges grouped together. |
| Shipping | `SHIPPING` charge only; do not add Delivery shipping again. |
| Other | `OTHER` charge. |
| Rental refund | Nonvoided `OUT` `ORDER_REFUND` for a completed order, paid at or after completion, recorded as negative revenue on `paidAt`. |
| Operating expense | Paid, nonvoided Expense amount on its business expense date. |

Charges use order completion time and are not duplicated in the rental residual.
Order-wide discounts reduce the rental residual because the domain does not
allocate discounts across individual charges. That residual can be negative if
the discount exceeds the rental amount. Precompletion order refunds reconcile
prepayments; postcompletion order refunds reverse recognized revenue.
`DEPOSIT_REFUND` is excluded.

## API and access

- `GET /finance/summary` returns period totals and a category breakdown. It
  does not return a transaction collection.
- `GET /finance/transactions` returns a bounded paginated list with source ID,
  code, timestamp, direction, category, description, amount and optional order
  reference.
- Both endpoints support today/week/month/custom periods, direction and
  category filters. Custom periods are limited to 366 dates.
- Reads require `finance.view`. Expense creation requires `finance.manage`.
- Money is stored as PostgreSQL decimal and returned using the existing API
  decimal semantics.

## Query boundaries

The repository performs filtering, aggregation, counts and bounded pagination
inside parameterized PostgreSQL queries. Every branch and order join is scoped
to the authenticated shop. Timestamps use the shop timezone and half-open
instant ranges; expenses use native SQL `DATE` bounds. Stable source-prefixed
IDs break timestamp ties.

The initial-release database baseline contains the schema and indexes required
by these queries. PostgreSQL integration tests cover recognized revenue,
deposit offsets, discounts, refunds, void/pending expenses, completion state,
date boundaries, shop isolation, pagination and query counts. Use only a
dedicated test database when running them; see [Testing](TESTING.md).
