# Delivery status lifecycle

## Source facts and C34 decision

The status endpoint previously accepted every `DeliveryStatus` enum member and wrote it by id. No Admin or storefront caller, test, or operational document in this repository relies on a backward transition, a `FAILED` retry, or a same-status metadata edit.

C34 therefore adopts this conservative normal-operation matrix:

| From         | Allowed targets                     |
| ------------ | ----------------------------------- |
| `PENDING`    | `READY`, `CANCELLED`                |
| `READY`      | `PICKED_UP`, `CANCELLED`            |
| `PICKED_UP`  | `DELIVERING`, `DELIVERED`, `FAILED` |
| `DELIVERING` | `DELIVERED`, `FAILED`               |
| `DELIVERED`  | none                                |
| `FAILED`     | none                                |
| `CANCELLED`  | none                                |

`DELIVERED` and `CANCELLED` are terminal. `FAILED` does not retry implicitly. A same-status request is not a transition and is rejected, including when it contains shipper or tracking metadata. A future retry, correction, or metadata-only command must be explicit, define its own authorization and timestamp behavior, and have an audit contract; there is no `force` or backward-transition bypass.

## Persistence and timestamps

The repository reads the delivery scoped by `shopId`, checks this policy against the persisted status, then executes a conditional update with `id`, `shopId`, and the expected status. A zero-row conditional update is a concurrent modification, not a 404. Metadata, status, and transition timestamps are in the same write, so a losing request cannot overwrite the winning request's metadata or timestamps.

`pickedUpAt` is set only by a committed transition into `PICKED_UP`. It remains unchanged for later forward transitions. `deliveredAt` is set only by a committed transition into `DELIVERED`. Normal transitions never clear either timestamp. `FAILED` and `CANCELLED` do not set either timestamp.

The status command does not create or remove shipping charges, recompute rental totals, or impose C05's closed-order monetary creation guard. Delivery creation remains the owner of that boundary.

## Audit and rollout

Only a successful compare-and-swap produces the existing best-effort `STATUS_CHANGE` audit, now with `oldValues.status` and `newValues.status`. Rejected and racing requests produce no success audit. No delivery status outbox event is introduced.

Deploy all backend instances together where possible. A remaining old instance can still accept a backward update until it is replaced. This change does not alter historical delivery rows or attempt a data reconciliation.
