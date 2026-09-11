BEGIN;

-- Preserve allocation/history rows. An orphaned legacy occupancy value cannot
-- prove physical availability: send it through the existing cleaning workflow.
UPDATE "inventory_items" AS item
SET "current_status" = CASE WHEN EXISTS (
  SELECT 1 FROM "rental_item_allocations" AS allocation
  WHERE allocation.inventory_item_id = item.id
    AND allocation.shop_id = item.shop_id
    AND allocation.status IN ('HELD', 'CONFIRMED', 'ACTIVE')
    AND allocation.released_at IS NULL
) THEN 'AVAILABLE' ELSE 'CLEANING' END
WHERE item."current_status" IN ('RESERVED', 'RENTED');

-- Enforce that inventory_items.current_status only contains physical operational conditions
ALTER TABLE "inventory_items"
  ADD CONSTRAINT "inventory_items_operational_status_check"
  CHECK ("current_status" IN ('AVAILABLE', 'CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED'));

COMMIT;
