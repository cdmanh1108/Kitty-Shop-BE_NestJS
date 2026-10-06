-- Existing catalog rows retain ordinary product behavior. No name/category inference.
ALTER TABLE "products"
  ADD COLUMN "kind" VARCHAR(20) NOT NULL DEFAULT 'PRODUCT',
  ADD CONSTRAINT "products_kind_check" CHECK ("kind" IN ('PRODUCT', 'ACCESSORY'));

CREATE INDEX "products_shop_kind_visibility_idx"
  ON "products" ("shop_id", "kind", "status", "is_public", "is_rentable", "archived_at", "created_at" DESC);
