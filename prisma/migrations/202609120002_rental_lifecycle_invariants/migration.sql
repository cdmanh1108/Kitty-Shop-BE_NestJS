ALTER TABLE "rental_orders"
  ADD COLUMN "collateral_method" VARCHAR(20) NOT NULL DEFAULT 'CASH',
  ADD COLUMN "document_type" VARCHAR(20),
  ADD COLUMN "collateral_status" VARCHAR(20) NOT NULL DEFAULT 'REQUIRED',
  ADD COLUMN "collateral_received_at" TIMESTAMPTZ(6),
  ADD COLUMN "collateral_returned_at" TIMESTAMPTZ(6);

CREATE TABLE "customer_loyalty_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "entry_type" VARCHAR(20) NOT NULL,
  "reward_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_loyalty_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_loyalty_entries_order_id_key" ON "customer_loyalty_entries"("order_id");
CREATE INDEX "customer_loyalty_entries_shop_id_customer_id_created_at_idx" ON "customer_loyalty_entries"("shop_id", "customer_id", "created_at");
ALTER TABLE "customer_loyalty_entries" ADD CONSTRAINT "customer_loyalty_entries_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_loyalty_entries" ADD CONSTRAINT "customer_loyalty_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_loyalty_entries" ADD CONSTRAINT "customer_loyalty_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
