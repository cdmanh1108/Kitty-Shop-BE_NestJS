# Rental monetary mutation boundary

`lockRentalMonetaryOrder(tx, { shopId, orderId })` is the infrastructure
boundary for mutations that can change an order's monetary state. It locks the
tenant-scoped order row with `FOR UPDATE` inside the caller's serializable
transaction. The required lock order is `shopId`, then `orderId`.

| Caller                           | Boundary                                              | Protected re-read and policy                                             | Atomic writes                                                                                     | Error / rollback                                                            |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Rental `addCharge`               | `serializableTransaction` + `lockRentalMonetaryOrder` | Order and settlement; `assertChargeMutationAllowed`                      | Charge, totals and payment state                                                                  | `ORDER_LOCKED` / `ORDER_ALREADY_SETTLED`; the whole transaction rolls back. |
| Rental `settleOrder`             | `serializableTransaction` + `lockRentalMonetaryOrder` | Order, charges, payments and settlement; `assertSettlementAllowed`       | Receipts, payment state, settlement snapshot, completed state, loyalty, history, audit and outbox | Invariant failures roll back; `P2034` uses the existing bounded retry only. |
| Delivery shipping mutation (C05) | Not integrated yet                                    | Must lock then re-read order/settlement before totals or delivery writes | Delivery job, shipping charge and totals in one transaction                                       | No post-settlement mutation.                                                |
| Finance payment/void (C06)       | Not integrated yet                                    | Resolve tenant order, lock, then re-read payment/order state             | Payment/void and derived payment state in one transaction                                         | Must not reuse a pre-lock payment snapshot.                                 |

Application pre-checks are UX only; they are not monetary authority. No nested
transaction may be opened after obtaining the context, and all protected reads
and writes must use the same transaction client. Settlement refunds and offsets
remain valid within the settlement transaction. Post-settlement corrections need
a separate policy and audit contract.
