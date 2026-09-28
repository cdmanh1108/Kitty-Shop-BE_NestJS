-- Auth cleanup selects bounded candidates by their terminal event timestamp.
-- Expression indexes make the family/OTP retention predicates indexable without changing data.
CREATE INDEX "refresh_tokens_family_terminal_at_idx"
  ON "refresh_tokens" ("family_id", (COALESCE("revoked_at", "expires_at")));

CREATE INDEX "refresh_token_families_terminal_at_idx"
  ON "refresh_token_families" ((COALESCE("reuse_detected_at", "revoked_at", "created_at")));

CREATE INDEX "web_refresh_tokens_family_terminal_at_idx"
  ON "web_refresh_tokens" ("family_id", (COALESCE("revoked_at", "expires_at")));

CREATE INDEX "web_refresh_token_families_terminal_at_idx"
  ON "web_refresh_token_families" ((COALESCE("reuse_detected_at", "revoked_at", "created_at")));

CREATE INDEX "web_otp_challenges_terminal_at_idx"
  ON "web_otp_challenges" ((COALESCE("consumed_at", "expires_at")));
