-- Backfill canonical slug for products with NULL slug
UPDATE "products"
SET "slug" = LOWER(REGEXP_REPLACE(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', ''))
WHERE "slug" IS NULL;

-- Create index on products(shop_id, slug)
CREATE INDEX "products_shop_id_slug_idx" ON "products"("shop_id", "slug");
