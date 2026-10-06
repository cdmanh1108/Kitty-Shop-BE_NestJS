-- New returns capture per-SKU configured and agreed fees. Historical returns remain unchanged.
ALTER TABLE "rental_return_inspections"
  ADD COLUMN "calculated_late_fee" DECIMAL(18,2),
  ADD COLUMN "calculated_additional_rental" DECIMAL(18,2),
  ADD COLUMN "late_fee" DECIMAL(18,2),
  ADD COLUMN "additional_rental" DECIMAL(18,2),
  ADD COLUMN "fee_override_reason" VARCHAR(2000),
  ADD COLUMN "pricing_version" VARCHAR(30),
  ADD CONSTRAINT "return_inspection_fee_nonnegative" CHECK (
    "calculated_late_fee" >= 0 AND "calculated_additional_rental" >= 0 AND
    "late_fee" >= 0 AND "additional_rental" >= 0
  ),
  ADD CONSTRAINT "return_inspection_override_reason" CHECK (
    "fee_override_reason" IS NULL OR length(btrim("fee_override_reason")) > 0
  ),
  ADD CONSTRAINT "return_inspection_fee_snapshot" CHECK (
    ("calculated_late_fee" IS NULL AND "calculated_additional_rental" IS NULL AND
     "late_fee" IS NULL AND "additional_rental" IS NULL AND "pricing_version" IS NULL AND "fee_override_reason" IS NULL) OR
    ("calculated_late_fee" IS NOT NULL AND "calculated_additional_rental" IS NOT NULL AND
     "late_fee" IS NOT NULL AND "additional_rental" IS NOT NULL AND "pricing_version" IS NOT NULL AND
     "pricing_version" IN ('LEGACY_RATE_V1', 'CYCLE_V1', 'FREE_ACCESSORY_V1') AND
     ("fee_override_reason" IS NOT NULL OR
      ("late_fee" = "calculated_late_fee" AND "additional_rental" = "calculated_additional_rental")))
  ),
  ADD CONSTRAINT "return_inspection_free_fee" CHECK (
    "pricing_version" <> 'FREE_ACCESSORY_V1' OR
    ("calculated_late_fee" = 0 AND "calculated_additional_rental" = 0 AND
     "late_fee" = 0 AND "additional_rental" = 0 AND "fee_override_reason" IS NULL)
  );
