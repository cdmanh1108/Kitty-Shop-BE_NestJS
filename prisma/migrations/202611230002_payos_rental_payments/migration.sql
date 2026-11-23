
BEGIN;

ALTER TABLE "rental_orders"
  DROP CONSTRAINT "rental_orders_preferred_payment_method_check",
  ADD CONSTRAINT "rental_orders_preferred_payment_method_check"
    CHECK ("preferred_payment_method" IN ('cash', 'bank_transfer', 'payos'));

ALTER TABLE "payment_transactions"
  DROP CONSTRAINT "payment_source_check",
  ADD CONSTRAINT "payment_source_check" CHECK ("source" IN ('ADMIN_MANUAL', 'INTERNAL_TRANSFER', 'PAYOS'));

CREATE TABLE "rental_payos_attempts" (
    "order_id" UUID NOT NULL,
    "order_code" BIGSERIAL NOT NULL,
    "rental_amount" DECIMAL(18,0) NOT NULL,
    "deposit_amount" DECIMAL(18,0) NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'NEW',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "provider_link_id" VARCHAR(64),
    "checkout_url" VARCHAR(255),
    "claim_id" UUID,
    "claim_until" TIMESTAMPTZ(6),
    "next_check_at" TIMESTAMPTZ(6) NOT NULL,
    "close_reason" VARCHAR(16),
    "review_reason" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rental_payos_attempts_pkey" PRIMARY KEY ("order_id"),
    CONSTRAINT "rental_payos_attempts_amount_check"
      CHECK ("rental_amount" >= 0 AND "deposit_amount" >= 0 AND "rental_amount" + "deposit_amount" > 0),
    CONSTRAINT "rental_payos_attempts_state_check"
      CHECK ("state" IN ('NEW', 'CREATING', 'PENDING', 'PAID', 'REVIEW', 'CLOSED'))
);

ALTER SEQUENCE "rental_payos_attempts_order_code_seq" START WITH 1000000000000 RESTART WITH 1000000000000;
CREATE UNIQUE INDEX "rental_payos_attempts_order_code_key" ON "rental_payos_attempts"("order_code");
CREATE UNIQUE INDEX "rental_payos_attempts_provider_link_id_key" ON "rental_payos_attempts"("provider_link_id");
CREATE INDEX "rental_payos_attempts_state_next_check_at_idx" ON "rental_payos_attempts"("state", "next_check_at");
ALTER TABLE "rental_payos_attempts" ADD CONSTRAINT "rental_payos_attempts_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payos_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shop_id" UUID NOT NULL,
    "order_id" UUID,
    "provider_order_code" BIGINT NOT NULL,
    "provider_link_id" VARCHAR(64) NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "state" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(32),
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "refund_reference" VARCHAR(100),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payos_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payos_transfers_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "payos_transfers_state_check" CHECK ("state" IN ('APPLIED', 'REVIEW', 'REFUNDED'))
);
CREATE UNIQUE INDEX "payos_transfers_reference_key" ON "payos_transfers"("reference");
CREATE UNIQUE INDEX "payos_transfers_refund_reference_key" ON "payos_transfers"("refund_reference");
CREATE INDEX "payos_transfers_shop_id_state_paid_at_idx" ON "payos_transfers"("shop_id", "state", "paid_at");
CREATE INDEX "payos_transfers_order_id_idx" ON "payos_transfers"("order_id");
ALTER TABLE "payos_transfers" ADD CONSTRAINT "payos_transfers_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payos_transfers" ADD CONSTRAINT "payos_transfers_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
