-- Pending credentials created before this migration lack a trustworthy proof binding.
-- They remain unverified until the customer starts a new attempt.
ALTER TABLE web_accounts
  ADD COLUMN pending_password_hash TEXT,
  ADD COLUMN registration_attempt_id UUID;

ALTER TABLE web_otp_challenges
  ADD COLUMN registration_attempt_id UUID;

CREATE INDEX web_otp_challenges_account_attempt_idx
  ON web_otp_challenges (account_id, registration_attempt_id);
