# Storefront order idempotency

`POST /api/v1/web/rental-orders` requires exactly one `Idempotency-Key`
header. The value is opaque, case-sensitive ASCII with 1–255 non-whitespace
characters. The server does not trim or generate it. Missing, empty, malformed
or repeated headers are rejected before a claim or customer write.

| Header | Scope | Same/different command | Result | Retention |
| --- | --- | --- | --- | --- |
| `Idempotency-Key: <opaque ASCII>` | Trusted shop, Web create command and authenticated account | Stable object-key ordering is ignored; accepted fields are hashed. Array order and phone formatting remain significant. | First success returns HTTP 201. Identical retries replay the original safe result. A changed command returns 409. In-progress requests return 409. | Five-minute processing lease; 24 hours from claim acquisition. |

The key is not an authentication credential. The signed-in account is part of
the claim hash, so one account cannot replay another account's result. Admin
claims use a separate scope.

The claim is acquired before customer resolution. A completed claim replays its
stored Web-safe result without invoking customer resolution, pricing,
availability, booking or outbox creation. A new request validates account,
selection, pricing and inventory before resolving the CRM customer. The fenced
booking transaction locks the claim and writes the order, allocations, outbox
event and replay result atomically. Customer contact creation is intentionally
separate; a later booking failure can leave a valid reusable CRM profile, but
never a partial rental order.

The storefront creates one cryptographically random key per checkout intent
and forwards it unchanged to the API. It reuses that key and the exact request
body after an uncertain response or an in-progress result. A changed checkout
intent gets a new key. Request IDs, account IDs, phone numbers and quote IDs are
not substitutes for the idempotency key.
