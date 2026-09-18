-- Product slugs are public identities. Backfill every legacy null/blank value before NOT NULL.
-- Code is shop-unique and stable, so it provides a deterministic fallback when a legacy name cannot
-- be transliterated safely in SQL. Existing non-blank slugs remain unchanged (including archived rows).
DO $$
DECLARE
  product_row RECORD;
  base_slug text;
  candidate_slug text;
  suffix integer;
BEGIN
  FOR product_row IN
    SELECT id, shop_id, code
    FROM products
    WHERE slug IS NULL OR btrim(slug) = ''
    ORDER BY shop_id, created_at, id
  LOOP
    base_slug := lower(regexp_replace(product_row.code, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' FROM base_slug);
    IF base_slug = '' THEN
      base_slug := 'product-' || replace(product_row.id::text, '-', '');
    END IF;

    candidate_slug := base_slug;
    suffix := 2;
    WHILE EXISTS (
      SELECT 1
      FROM products
      WHERE shop_id = product_row.shop_id
        AND slug = candidate_slug
        AND id <> product_row.id
    ) LOOP
      candidate_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;

    UPDATE products SET slug = candidate_slug WHERE id = product_row.id;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE slug IS NULL OR btrim(slug) = '') THEN
    RAISE EXCEPTION 'Product slug backfill did not resolve every null or blank slug.';
  END IF;
END $$;

ALTER TABLE products ALTER COLUMN slug SET NOT NULL;
