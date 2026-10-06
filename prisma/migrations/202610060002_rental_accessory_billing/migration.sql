-- Preserve every historical line as paid, including historical zero-price overrides.
ALTER TABLE "rental_order_items"
  ADD COLUMN "billing_role" VARCHAR(30) NOT NULL DEFAULT 'PAID',
  ADD COLUMN "product_kind_snapshot" VARCHAR(20) NOT NULL DEFAULT 'PRODUCT';

ALTER TABLE "rental_order_items"
  ADD CONSTRAINT "rental_order_items_billing_role_check"
    CHECK ("billing_role" IN ('PAID', 'FREE_ACCESSORY')),
  ADD CONSTRAINT "rental_order_items_product_kind_snapshot_check"
    CHECK ("product_kind_snapshot" IN ('PRODUCT', 'ACCESSORY')),
  ADD CONSTRAINT "rental_order_items_free_accessory_check"
    CHECK ("billing_role" <> 'FREE_ACCESSORY' OR (
      "product_kind_snapshot" = 'ACCESSORY'
      AND "unit_rental_price" = 0 AND "line_total" = 0
      AND "deposit_amount" = 0 AND "discount_amount" = 0
    ));

-- Existing allocation exclusion constraint remains the booking concurrency guard.
