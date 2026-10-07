BEGIN;

ALTER TABLE "web_accounts"
  ADD COLUMN "full_name" VARCHAR(100),
  ADD COLUMN "contact_phone" VARCHAR(10),
  ADD CONSTRAINT "web_accounts_full_name_check"
    CHECK ("full_name" IS NULL OR ("full_name" = btrim("full_name") AND char_length("full_name") BETWEEN 2 AND 100)),
  ADD CONSTRAINT "web_accounts_contact_phone_check"
    CHECK ("contact_phone" IS NULL OR "contact_phone" ~ '^0[0-9]{9}$');

-- Contact defaults are not identity keys; retain legacy phone/verification columns unchanged.
-- Existing orders and CRM profiles are deliberately not backfilled or linked.
COMMIT;
