-- Keep existing WebAccount rows and their ID-based relations intact. There is
-- no trustworthy email source for the phone-only rows, so they remain legacy.
ALTER TABLE "web_accounts"
  ADD COLUMN "email" VARCHAR(254),
  ADD COLUMN "email_verified_at" TIMESTAMPTZ(6),
  ALTER COLUMN "phone" DROP NOT NULL;

CREATE UNIQUE INDEX "web_accounts_email_key" ON "web_accounts"("email");

-- Application normalization is authoritative; this also prevents non-canonical
-- writes from bypassing the case-sensitive unique index.
ALTER TABLE "web_accounts"
  ADD CONSTRAINT "web_accounts_email_canonical"
  CHECK ("email" IS NULL OR ("email" = lower(btrim("email")) AND "email" <> ''));

-- Challenges created by the previous SMS flow must never verify an email.
UPDATE "web_otp_challenges" AS challenge
SET "consumed_at" = CURRENT_TIMESTAMP
FROM "web_accounts" AS account
WHERE challenge."account_id" = account."id"
  AND account."email" IS NULL
  AND challenge."consumed_at" IS NULL;

UPDATE "web_accounts"
SET "pending_password_hash" = NULL,
    "registration_attempt_id" = NULL
WHERE "email" IS NULL;
