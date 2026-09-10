# Domain invariants

- A Product is a catalog concept; an InventoryItem is a unique physical rentable object.
- Every active physical rental is represented by a RentalItemAllocation.
- Active allocations for the same InventoryItem may not overlap in time.
- Rental interval semantics are `[start, end)`.
- An order stores historical name/price snapshots.
- `OVERDUE` is derived, not a persisted independent lifecycle state.
- Completing a rental sends returned inventory to CLEANING by default; staff returns it to AVAILABLE after cleaning/inspection.
- Deposit cash movements are separate from earned rental revenue.
- Payment status and deposit status are derived from non-voided transaction history.
- Void/cancel/archive replaces destructive delete for business history.
- Money uses decimal values only.
- Business timestamps use timezone-aware timestamps; shop timezone controls day/month reporting boundaries.
