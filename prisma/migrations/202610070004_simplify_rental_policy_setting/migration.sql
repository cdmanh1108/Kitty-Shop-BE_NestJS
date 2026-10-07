BEGIN;

-- Keep only the three shop-editable values in the policy JSON. The backend
-- provides fixed business rules from code; rental_rates history is untouched.
UPDATE "app_settings"
SET "value" = jsonb_build_object(
  'rentalPricing', jsonb_build_object(
    'defaultRentalPrice', CASE
      WHEN jsonb_typeof("value" #> '{rentalPricing,defaultRentalPrice}') = 'number'
        THEN "value" #> '{rentalPricing,defaultRentalPrice}'
      ELSE to_jsonb(50000)
    END,
    'additionalDayFee', CASE
      WHEN jsonb_typeof("value" #> '{rentalPricing,additionalDayFee}') = 'number'
        THEN "value" #> '{rentalPricing,additionalDayFee}'
      ELSE to_jsonb(10000)
    END
  ),
  'deposit', jsonb_build_object(
    'defaultCashDeposit', CASE
      WHEN jsonb_typeof("value" #> '{deposit,defaultCashDeposit}') = 'number'
        THEN "value" #> '{deposit,defaultCashDeposit}'
      ELSE to_jsonb(200000)
    END
  )
)
WHERE "key" = 'rental_policy'
  AND jsonb_typeof("value") = 'object';

COMMIT;
