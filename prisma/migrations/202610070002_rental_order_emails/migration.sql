ALTER TABLE "rental_orders" ADD COLUMN "notification_email" VARCHAR(255);
-- Historical orders intentionally retain NULL: CRM email is not order authorization/contact.
ALTER TABLE "notification_logs"
  ADD COLUMN "event_id" UUID,
  ADD COLUMN "event_sequence" INTEGER,
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "from_address" VARCHAR(400),
  ADD COLUMN "subject" VARCHAR(255),
  ADD COLUMN "html" TEXT,
  ADD COLUMN "owner_token" UUID,
  ADD COLUMN "lease_until" TIMESTAMPTZ(6),
  ADD COLUMN "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "first_attempt_at" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "notification_logs_event_id_key" ON "notification_logs"("event_id");
CREATE UNIQUE INDEX "notification_logs_order_email_template_key"
  ON "notification_logs"("order_id", "template_code")
  WHERE "event_id" IS NOT NULL AND "channel" = 'EMAIL';
CREATE INDEX "notification_logs_channel_status_available_at_idx"
  ON "notification_logs"("channel", "status", "available_at");
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_email_queue_check" CHECK (
  "event_id" IS NULL OR (
    "channel" = 'EMAIL' AND "order_id" IS NOT NULL AND "recipient" IS NOT NULL
    AND "payload" IS NOT NULL AND "event_sequence" IN (2, 4)
    AND "template_code" IN ('RENTAL_WEB_CONFIRMED', 'RENTAL_WEB_COMPLETED')
    AND "attempt_count" >= 0
    AND "status" IN ('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED', 'UNKNOWN')
    AND (("status" = 'PROCESSING' AND "owner_token" IS NOT NULL AND "lease_until" IS NOT NULL)
      OR ("status" <> 'PROCESSING' AND "owner_token" IS NULL AND "lease_until" IS NULL))
  ) IS TRUE
);
