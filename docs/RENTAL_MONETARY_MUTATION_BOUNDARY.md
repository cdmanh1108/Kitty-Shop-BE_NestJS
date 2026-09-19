# Rental monetary mutation boundary

`lockRentalMonetaryOrder(tx, { shopId, orderId })` is the infrastructure
boundary for mutations that can change an order's monetary state. It locks the
tenant-scoped order row with `FOR UPDATE` inside the caller's serializable
transaction. The required lock order is `shopId`, then `orderId`.

| Caller                        | Boundary                                                                               | Protected re-read and policy                                                                    | Atomic writes                                                                                             | Error / rollback                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Rental `addCharge`            | `serializableTransaction` + `lockRentalMonetaryOrder`                                  | Order and settlement; `assertChargeMutationAllowed`                                             | Charge, totals and payment state                                                                          | `ORDER_LOCKED` / `ORDER_ALREADY_SETTLED`; the whole transaction rolls back.              |
| Rental confirmation           | `serializableTransaction` + `lockRentalMonetaryOrder`                                  | Order and current ledger before confirmation receipts                                           | Confirmation, lifecycle receipts, payment state, status/history, audit and outbox                         | Existing confirmation invariants roll back; `P2034` uses the bounded retry.              |
| Rental `settleOrder`          | `serializableTransaction` + `lockRentalMonetaryOrder`                                  | Order, charges, payments and settlement; `assertSettlementAllowed`                              | Receipts, payment state, settlement snapshot, completed state, loyalty, history, audit and outbox         | Invariant failures roll back; `P2034` uses the existing bounded retry only.              |
| Delivery paid shipping create | `serializableTransaction` + `lockRentalMonetaryOrder`                                  | Order and settlement; `assertChargeMutationAllowed`                                             | Delivery job, one shipping charge, totals, payment state and `DELIVERY_CREATED` outbox in one transaction | `ORDER_LOCKED` / `ORDER_ALREADY_SETTLED`; the whole transaction rolls back.              |
| Finance payment create        | `serializableTransaction` + `lockRentalMonetaryOrder`                                  | Order and settlement; `assertPaymentCreationAllowed`; refund ceiling                            | Payment, derived state and `PAYMENT_RECORDED` outbox                                                      | `PAYMENT_RECORD_LOCKED` or refund invariant; the whole transaction rolls back.           |
| Finance payment void          | Tenant-scoped route lookup, then `serializableTransaction` + `lockRentalMonetaryOrder` | Re-read order, settlement, payment provenance and refundable ledger; `assertPaymentVoidAllowed` | Void fields and derived payment state                                                                     | `PAYMENT_VOID_PROTECTED` / refund invariant; stale or foreign payment remains not-found. |

Application pre-checks are UX only; they are not monetary authority. No nested
transaction may be opened after obtaining the context, and all protected reads
and writes must use the same transaction client. Settlement refunds and offsets
remain valid within the settlement transaction. Post-settlement corrections need
a separate policy and audit contract.

Delivery creation with `shippingFee = 0` remains a non-monetary logistics
operation for compatibility: it creates the delivery job and `DELIVERY_CREATED`
outbox event without a charge, totals/payment-state write, or monetary lock.
This is not a bypass for a positive fee, and does not authorize a later fee
change.

Generic Finance writes are allowed while an order is open. Once a settlement
exists or an order is completed, only a new `OUT ORDER_REFUND` may be recorded
as an independent adjustment; it does not rewrite the settlement snapshot or
order totals. Generic void never changes lifecycle receipts (`RC-*`/`RS-*`),
internal deposit-offset transfers, or any payment on a settled order, including
a legacy manual payment without `receiptKey`. A manual payment may have been
used by confirmation without a durable payment-to-confirmation link, so generic
void is conservatively blocked once confirmation exists. C06 intentionally does
not add a general correction/reversal workflow; cancelled-order refund semantics
and voiding a post-completion adjustment remain unsupported.
