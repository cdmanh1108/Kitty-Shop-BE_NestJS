CREATE TYPE "web_otp_delivery_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

ALTER TABLE "web_otp_challenges"
  ADD COLUMN "delivery_status" "web_otp_delivery_status" NOT NULL DEFAULT 'SENT',
  ADD COLUMN "retry_anchor_id" UUID;
