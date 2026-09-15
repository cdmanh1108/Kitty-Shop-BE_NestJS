CREATE INDEX "rental_orders_shop_id_status_completed_at_idx"
ON "rental_orders" ("shop_id", "status", "completed_at");
