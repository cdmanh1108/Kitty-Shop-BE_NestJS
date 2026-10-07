-- Preserve existing accessory eligibility; all newly created products default to paid-only.
ALTER TABLE "products"
  ADD COLUMN "allow_free_accessory" BOOLEAN NOT NULL DEFAULT false;
UPDATE "products" SET "allow_free_accessory" = true WHERE "kind" = 'ACCESSORY';

DROP INDEX "products_shop_kind_visibility_idx";
ALTER TABLE "products" DROP CONSTRAINT "products_kind_check", DROP COLUMN "kind";
CREATE INDEX "products_shop_free_accessory_visibility_idx"
  ON "products" ("shop_id", "allow_free_accessory", "status", "is_public", "is_rentable", "archived_at", "created_at" DESC);

-- Keep the legacy snapshot untouched on old orders. New orders capture the flag
-- read inside the booking transaction, without inventing a category/kind.
ALTER TABLE "rental_order_items"
  ALTER COLUMN "product_kind_snapshot" DROP NOT NULL,
  ALTER COLUMN "product_kind_snapshot" DROP DEFAULT,
  ADD COLUMN "allow_free_accessory_snapshot" BOOLEAN;

ALTER TABLE "rental_order_items"
  DROP CONSTRAINT "rental_order_items_free_accessory_check",
  ADD CONSTRAINT "rental_order_items_free_accessory_check" CHECK (
    "billing_role" <> 'FREE_ACCESSORY' OR (
      ("allow_free_accessory_snapshot" IS TRUE OR
        ("allow_free_accessory_snapshot" IS NULL AND "product_kind_snapshot" IS NOT DISTINCT FROM 'ACCESSORY'))
      AND "unit_rental_price" = 0 AND "line_total" = 0
      AND "deposit_amount" = 0 AND "discount_amount" = 0
    )
  );
