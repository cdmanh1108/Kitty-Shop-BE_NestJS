ALTER TABLE "web_sessions" RENAME TO "web_refresh_tokens";
ALTER INDEX "web_sessions_pkey" RENAME TO "web_refresh_tokens_pkey";
ALTER INDEX "web_sessions_token_hash_key" RENAME TO "web_refresh_tokens_token_hash_key";
ALTER INDEX "web_sessions_account_id_idx" RENAME TO "web_refresh_tokens_account_id_idx";
ALTER INDEX "web_sessions_expires_at_idx" RENAME TO "web_refresh_tokens_expires_at_idx";
ALTER TABLE "web_refresh_tokens"
  ADD COLUMN "revoked_at" TIMESTAMPTZ(6),
  ADD COLUMN "user_agent" TEXT,
  ADD COLUMN "ip_address" INET;
