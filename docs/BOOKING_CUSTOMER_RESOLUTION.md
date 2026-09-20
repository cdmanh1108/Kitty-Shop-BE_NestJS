# Booking customer resolution

`CustomerRepository.resolveForBooking` is the only Web booking capability that
resolves a customer identity. It receives server-established `shopId` and the
guest contact fields, canonicalizes the phone with `normalizeCustomerPhone`,
and uses the exact `(shopId, normalizedPhone)` key.

| Caller                         | Canonical input                                         | Outcome                                                          | Transaction owner                                                              | Committed writes                                                                                   | Conflict/policy behavior                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebRentalService.createOrder` | Server shop plus guest phone normalized by the resolver | Reuse one active, unarchived customer or create one WEB customer | Independent customer persistence, then the existing rental booking transaction | A valid customer profile may remain if a late booking write fails; no partial booking is committed | A phone-key `P2002` is reread and eligible winner reused. Archived, BLOCKED, or unknown status produces `BOOKING_CUSTOMER_UNAVAILABLE`. Other database errors are not reclassified. |

The resolver is invoked only after the no-write selection, price, and inventory
preflight. Reuse never updates the existing profile; delivery contact remains
the contact submitted for that order. No guest flow restores an archived
profile or reactivates a blocked profile.

For C14, order idempotency remains separate from customer identity: two valid
booking intents can reference the same resolved customer. A replay mechanism
must avoid invoking this side-effecting resolver after it has determined that
the original order response is already complete.
