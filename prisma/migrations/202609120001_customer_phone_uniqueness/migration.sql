-- Customer phone is a tenant-scoped business identifier. Refuse to guess which
-- legacy profile owns history when duplicates exist; reconcile the reported rows
-- before retrying this migration.
DO $$
DECLARE invalid_ids text;
BEGIN
  SELECT string_agg(id::text, ', ')
  INTO invalid_ids
  FROM (
    SELECT id
    FROM customers
    WHERE (
      CASE
        WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '84%'
          THEN '0' || substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 3)
        ELSE regexp_replace(phone, '[^0-9]', '', 'g')
      END
    ) !~ '^0[0-9]{9}$'
    LIMIT 20
  ) invalid;

  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid customer phones require manual correction (customer ids): %', invalid_ids;
  END IF;
END $$;

UPDATE customers
SET normalized_phone = CASE
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '84%'
    THEN '0' || substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 3)
  ELSE regexp_replace(phone, '[^0-9]', '', 'g')
END;

DO $$
DECLARE duplicate_keys text;
BEGIN
  SELECT string_agg(format('%s:%s (%s rows)', shop_id, normalized_phone, duplicate_count), ', ')
  INTO duplicate_keys
  FROM (
    SELECT shop_id, normalized_phone, count(*) AS duplicate_count
    FROM customers
    GROUP BY shop_id, normalized_phone
    HAVING count(*) > 1
    LIMIT 20
  ) duplicates;

  IF duplicate_keys IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate customer normalized phones require manual reconciliation: %', duplicate_keys;
  END IF;
END $$;

DROP INDEX IF EXISTS "customers_shop_id_normalized_phone_idx";
CREATE UNIQUE INDEX "customers_shop_id_normalized_phone_key"
  ON "customers"("shop_id", "normalized_phone");
