# Booking customer resolution

`CustomerRepository.resolveForBooking` links a verified storefront order to the
shop CRM. It receives the server-resolved `shopId` and checkout contact fields,
normalizes the phone, and uses the exact `(shopId, normalizedPhone)` key.

| Caller | Input | Outcome | Persistence boundary |
| --- | --- | --- | --- |
| `WebRentalOrderService.createOrder` | Authenticated account, verified account email and checkout name/phone | Reuse an eligible active CRM customer or create one | CRM resolution happens after selection/pricing/availability preflight and before the fenced rental-order transaction. |

The existing CRM profile is not overwritten; delivery details remain the
contact supplied for the order. If a phone-key uniqueness race occurs, the
winning record is reread and reused only if eligible. Archived, blocked or
otherwise invalid customers are rejected. Other persistence errors keep their
original error meaning.

Order idempotency is separate from CRM identity. A completed retry replays its
stored response before customer resolution, so it cannot create a duplicate
profile or order. If a later booking write fails, a valid CRM customer may
remain, but no partial rental order is committed.
