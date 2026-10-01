ALTER TABLE "colors"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "colors"
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "sizes"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "sizes"
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "product_variants"
  DROP CONSTRAINT "product_variants_size_id_fkey",
  ADD CONSTRAINT "product_variants_size_id_fkey"
    FOREIGN KEY ("size_id") REFERENCES "sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  DROP CONSTRAINT "product_variants_color_id_fkey",
  ADD CONSTRAINT "product_variants_color_id_fkey"
    FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
