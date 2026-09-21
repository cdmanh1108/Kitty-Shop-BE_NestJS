# Web order idempotency (C14)

`POST /api/v1/web/rental-orders` requires exactly one `Idempotency-Key` header.
It is an opaque, case-sensitive ASCII value of 1–255 non-whitespace characters.
The server neither trims nor generates the key. Missing, empty, malformed, or
multi-value headers are rejected before a claim or customer write.

| Header/format                     | Required | Scope identity                                      | Same / different command                                                                                                                                                                                                              | Success and replay                                                                         | In-progress / conflict                                             | Lease / retention                                                                | Caller action                                                                                                             |
| --------------------------------- | -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Idempotency-Key: <opaque ASCII>` | Yes      | `(trusted shopId, web-rental-order.create.v1, key)` | Stable JSON object-key ordering is ignored. All accepted command fields, including contact, dates, ordered items, delivery, collateral and payment method, are hashed. Array ordering and recipient phone formatting remain distinct. | HTTP 201 with the original five-field Web creation snapshot and `Cache-Control: no-store`. | `IDEMPOTENCY_IN_PROGRESS` or `IDEMPOTENCY_KEY_REUSED` returns 409. | Five-minute processing lease; 24-hour retention measured from claim acquisition. | Create once per checkout intent; retry with the same key and unchanged body. Change a real intent and generate a new key. |

Web uses guest capability-key semantics: possession of the opaque key plus an
identical bound command, shop, and Web scope permits replay. It does not identify
or authorize a customer account, and it is not an order lookup API. Web and Admin
claims use different scopes, so the same raw key never crosses their response
boundaries.

The claim is acquired before selection and C13 customer resolution. A completed
claim replays its stored Web-safe snapshot without calling customer resolution,
pricing, availability, booking, or outbox creation. For a claimed request, the
existing fenced booking transaction locks the claim and writes order, allocations,
outbox event, and Web replay snapshot atomically. C13 customer persistence remains
independent: a late booking failure may retain one valid customer profile, while
the incomplete claim is owner-safely released or later recovered.

## C15 handoff

The storefront/BFF must generate a cryptographically random opaque key once per
checkout intent and forward it unchanged to `/api/orders` and then to the upstream
Web endpoint. It must retain the same key and exact body after a lost response or
`IDEMPOTENCY_IN_PROGRESS`; it must not substitute `x-request-id`, phone, quote ID,
or a new key. C16 payment/receipt idempotency is a separate scope and protocol.
