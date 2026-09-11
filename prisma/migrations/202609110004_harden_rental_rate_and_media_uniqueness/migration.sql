BEGIN;
-- statement-breakpoint
LOCK TABLE rental_rates, product_variants, product_media IN SHARE ROW EXCLUSIVE MODE;
-- statement-breakpoint
-- Existing duplicate prices/identities cannot be reconciled safely from timestamps.
-- Fail atomically for explicit operator reconciliation, preserving every row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM rental_rates WHERE is_active
    GROUP BY shop_id, product_id, variant_id, duration_days HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active rental rates: reconcile pricing scopes before retrying migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM product_variants WHERE archived_at IS NULL
    GROUP BY product_id, size_id, color_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate unarchived variant combinations: reconcile physical identities before retrying migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM product_media WHERE is_primary
    GROUP BY product_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple primary media: select one primary per product before retrying migration';
  END IF;
END $$;
-- statement-breakpoint
CREATE UNIQUE INDEX rental_rates_variant_active_unique
  ON rental_rates (shop_id, product_id, variant_id, duration_days)
  WHERE is_active = true AND variant_id IS NOT NULL;
-- statement-breakpoint
CREATE UNIQUE INDEX rental_rates_product_active_unique
  ON rental_rates (shop_id, product_id, duration_days)
  WHERE is_active = true AND variant_id IS NULL;
-- statement-breakpoint
CREATE UNIQUE INDEX product_variants_unarchived_combination_unique
  ON product_variants (product_id, size_id, color_id) NULLS NOT DISTINCT
  WHERE archived_at IS NULL;
-- statement-breakpoint
CREATE UNIQUE INDEX product_media_product_id_primary_unique
  ON product_media (product_id) WHERE is_primary = true;
-- statement-breakpoint
COMMIT;
