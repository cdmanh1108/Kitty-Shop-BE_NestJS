# Web order lookup ledger semantics

`POST /api/v1/web/rental-orders/lookup` preserves its existing `orderCode` + phone and
shop-resolution boundary. Its `paidAmount` is a JSON number whose value is the current
net of all completed, non-voided, non-deposit payment ledger entries for that order:
inbound records add and outbound records subtract.

| Consumer           | Representation | Ledger definition                                  |
| ------------------ | -------------- | -------------------------------------------------- |
| Web lookup         | JSON number    | Net completed, non-voided non-deposit payments     |
| Admin order detail | Decimal string | The same `calculateRentalPaymentTotals` definition |

`DEPOSIT` and `DEPOSIT_REFUND` do not affect `paidAmount`. A settlement deposit offset
has a deposit leg and a `RENTAL_PAYMENT` leg; only the latter contributes. Valid
post-completion `ORDER_REFUND` records reduce the current projection. The projection is
read-only: it neither reconciles historical records nor changes a settlement snapshot.
