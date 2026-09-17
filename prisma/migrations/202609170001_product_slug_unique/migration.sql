-- Deduplicate duplicate product slugs deterministically by appending '-' || LOWER(code) for later created products
WITH ranked_products AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY shop_id, slug
           ORDER BY created_at ASC, id ASC
         ) as rn,
         LOWER(code) as lower_code
  FROM products
  WHERE slug IS NOT NULL
)
UPDATE products p
SET slug = p.slug || '-' || r.lower_code
FROM ranked_products r
WHERE p.id = r.id AND r.rn > 1;

-- Ensure no duplicate slugs remain before applying unique constraint
DO $$
DECLARE duplicate_keys text;
BEGIN
  SELECT string_agg(format('shop:%s slug:%s (%s rows)', shop_id, slug, duplicate_count), ', ')
  INTO duplicate_keys
  FROM (
    SELECT shop_id, slug, count(*) AS duplicate_count
    FROM products
    WHERE slug IS NOT NULL
    GROUP BY shop_id, slug
    HAVING count(*) > 1
    LIMIT 20
  ) duplicates;

  IF duplicate_keys IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate product slugs require manual reconciliation: %', duplicate_keys;
  END IF;
END $$;

-- Drop non-unique index
DROP INDEX IF EXISTS "products_shop_id_slug_idx";

-- Create unique index
CREATE UNIQUE INDEX "products_shop_id_slug_key" ON "products"("shop_id", "slug");
