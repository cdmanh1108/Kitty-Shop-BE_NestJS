# Domain invariants

- A Product is a catalog concept; an InventoryItem is a unique physical rentable object.
- Every active physical rental is represented by a RentalItemAllocation.
- Active allocations for the same InventoryItem may not overlap in time.
- Rental interval semantics are `[start, end)`.
- Each PAID physical unit grants one FREE_ACCESSORY unit, including paid standalone accessories and zero-price items. Free units never earn another allowance or affect the pricing quantity tier. The allowance is pooled within the order; excess selections must be explicitly PAID.
- Only products with allowFreeAccessory=true can supply FREE_ACCESSORY variants, independent of category. Booking revalidates the flag and entitlement inside its Serializable transaction, writes immutable billing-role/eligibility snapshots, and applies the same allocation overlap constraint to both roles. Paid and free lines of the same variant share one stock pool and never share a SKU.
- FREE_ACCESSORY_V1 snapshots have zero rental price, deposit and automatic late fees. Damage/loss inspections and compensation remain applicable, as do all reservation, handover, reschedule, return and cancellation allocation rules. A stored line's role is immutable; current catalog eligibility does not reclassify it.
- An order stores immutable name and price snapshots.
- Cycle pricing applies to storefront quotes and new Admin/Web bookings: PAID physical quantity selects the renewal day (default below 3: day 5; at least 3: day 8). Renewal days replace the daily surcharge with the effective cycle price; cycles repeat every renewalDay - 1 days. FREE_ACCESSORY units do not affect the pricing quantity tier.
- Only base cycle price, next-day surcharge and default cash deposit are editable shop settings. Quantity thresholds, renewal days and online duration are backend rules. Catalog products do not own rental-rate schedules.
- Cycle price precedence is item override, order override, then shop setting, including explicit zero. Every paid cycle line captures policy, quantity context and overrides in a CYCLE_V1 snapshot; reads and transactional validation use that snapshot, never current pricing settings. Free accessories use FREE_ACCESSORY_V1; unsupported or incomplete pricing snapshots are rejected.
- Return fees use the saved rental pricing per physical SKU. A reasoned override (including zero) replaces that SKU's whole time fee. Free accessories have no time fee but still incur damage/loss compensation. Receive-return and settlement revalidate under the monetary order lock, with optional freshness tokens; settlement fee overrides require a token. Original configured fees remain available, replaced charges are voided with durable audit, and rental overpayment refunds remain separate from deposit refunds.
- Storefront availability, quote and creation enforce maxOnlineRentalDays (default 9), including a write-boundary guard; manual Admin bookings have no online-duration cap. Completed idempotent creates replay before reading current policy, so subsequent pricing or duration-limit edits cannot alter the retained result.
- Rental order source is required and immutable creation provenance: storefront checkout is ONLINE, while Admin/manual entry is OFFLINE. It is independent from CRM customer identity and WebAccount ownership.
- ONLINE bookings require an enabled account with verified email, rechecked in the write transaction. Notification email comes from that account, never the Web request. Name/phone defaults are independent contact fields, not authentication or ownership keys; profile edits do not rewrite orders or CRM.
- ONLINE order emails capture the verified account email per order; mutable CRM/account data never redirects it. Confirmed/completed email consumer snapshots commit with the owning outbox transaction. Creation and cancellation do not enqueue email. Delivery runs asynchronously with owner fencing and bounded stable-key retries; provider acceptance is not inbox delivery.
- RentalOrder.webAccountId is nullable storefront ownership and never replaces customerId; account deletion preserves order history by setting only webAccountId to NULL.
- A WebAccount may self-cancel only its own ONLINE, RESERVED, unpaid order with no held deposit; cancellation uses the canonical transactional lifecycle and WebAccount audit actor, never staff actor IDs.
- Only RESERVED orders can be cancelled; transaction adapters revalidate the canonical state machine independently of supplied source statuses.
- Rescheduling keeps the priced duration and places the new start between original createdAt and createdAt + rental policy maxDaysFromBooking (inclusive, elapsed 24-hour days). The booking anchor never changes.
- `OVERDUE` is derived, not a persisted independent lifecycle state.
- Completing a rental sends returned inventory to CLEANING by default; staff returns it to AVAILABLE after cleaning/inspection.
- Deposit cash movements are separate from earned rental revenue.
- Payment status and deposit status are derived from non-voided transaction history.
- Void/cancel/archive replaces destructive delete for business history.
- Money uses decimal values only.
- Business timestamps use timezone-aware timestamps; shop timezone controls day/month reporting boundaries.

- A rental earns one loyalty qualification only when it reaches COMPLETED through settlement. Loyalty is scoped to the immutable `webAccountId` when present; otherwise it belongs to the CRM `customerId`. Contact phone/email never merge these owners. Every fifth qualification issues one 50,000 VND reward and starts the next five-order cycle; qualification/reward/outbox writes stay in the settlement transaction.
- Loyalty rewards are explicit records with AVAILABLE/REDEEMED/REVOKED status and a unique earning order. Any future checkout redemption must validate ownership and consume the reward atomically with order creation; client-provided discount amounts are not authoritative.

- Inventory currentStatus stores operational condition only; allocation status owns occupancy.
- Rental create/reschedule/handover and warehouse mutations validate inside Serializable transactions.
- Dates do not implicitly release warehouse occupancy; ACTIVE blocks booking until returned.
- Future reservations allow finishing cleaning/repair to AVAILABLE; handover requires AVAILABLE.

- Product and inventory archive are blocked by unreleased HELD/CONFIRMED/ACTIVE allocations, even after their planned end.
- Unarchived variant size/color combinations (including NULL) and primary product media have database uniqueness.

- Manual confirmation records actual rental/deposit receipts atomically with audit/outbox; suggested deposit is not a minimum or a debt.
- Payment balances come from the transaction ledger only, never ledger plus confirmation snapshots. Confirmation and physical handover remain separate.
- Settlement offsets deposit using paired internal transactions; actual refunds/collections record their payment method and actor. Receipt keys and provider references prevent duplicate recording.
