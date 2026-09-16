CREATE TABLE "web_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "phone" VARCHAR(30) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "phone_verified_at" TIMESTAMPTZ(6),
  "disabled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "web_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "web_accounts_phone_canonical" CHECK (phone ~ '^\+84[35789][0-9]{8}$')
);
CREATE UNIQUE INDEX "web_accounts_phone_key" ON "web_accounts"("phone");
CREATE TABLE "web_otp_challenges" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL REFERENCES "web_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "otp_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "resend_available_at" TIMESTAMPTZ(6) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "web_otp_challenges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "web_otp_challenges_account_id_created_at_idx" ON "web_otp_challenges"("account_id", "created_at");
CREATE INDEX "web_otp_challenges_expires_at_idx" ON "web_otp_challenges"("expires_at");
CREATE UNIQUE INDEX "web_otp_challenges_one_pending" ON "web_otp_challenges"("account_id") WHERE consumed_at IS NULL;
CREATE TABLE "web_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL REFERENCES "web_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "web_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "web_sessions_token_hash_key" ON "web_sessions"("token_hash");
CREATE INDEX "web_sessions_account_id_idx" ON "web_sessions"("account_id");
CREATE INDEX "web_sessions_expires_at_idx" ON "web_sessions"("expires_at");
