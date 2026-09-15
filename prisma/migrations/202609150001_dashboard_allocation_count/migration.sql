-- Dashboard counts unreleased ACTIVE allocations within the authenticated shop.
CREATE INDEX "rental_item_allocations_shop_id_status_released_at_idx"
ON "rental_item_allocations" ("shop_id", "status", "released_at");
