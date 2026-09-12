# Domain invariants

- A Product is a catalog concept; an InventoryItem is a unique physical rentable object.
- Every active physical rental is represented by a RentalItemAllocation.
- Active allocations for the same InventoryItem may not overlap in time.
- Rental interval semantics are `[start, end)`.
- An order stores historical name/price snapshots.
- Only RESERVED orders can be cancelled; transaction adapters revalidate the canonical state machine independently of supplied source statuses.
- Rescheduling keeps the priced duration and places the new start between original createdAt and createdAt + rental policy maxDaysFromBooking (inclusive, elapsed 24-hour days). The booking anchor never changes.
- `OVERDUE` is derived, not a persisted independent lifecycle state.
- Completing a rental sends returned inventory to CLEANING by default; staff returns it to AVAILABLE after cleaning/inspection.
- Deposit cash movements are separate from earned rental revenue.
- Payment status and deposit status are derived from non-voided transaction history.
- Void/cancel/archive replaces destructive delete for business history.
- Money uses decimal values only.
- Business timestamps use timezone-aware timestamps; shop timezone controls day/month reporting boundaries.

- Inventory currentStatus stores operational condition only; allocation status owns occupancy.
- Rental create/reschedule/handover and warehouse mutations validate inside Serializable transactions.
- Dates do not implicitly release warehouse occupancy; ACTIVE blocks booking until returned.
- Future reservations allow finishing cleaning/repair to AVAILABLE; handover requires AVAILABLE.

- Product and inventory archive are blocked by unreleased HELD/CONFIRMED/ACTIVE allocations, even after their planned end.
- One active rental rate per shop/product/variant/duration; NULL variant means product fallback. SQL partial indexes preserve unrestricted inactive history.
- Unarchived variant size/color combinations (including NULL) and primary product media have database uniqueness.
