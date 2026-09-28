-- Historical rental-order origin cannot be reconstructed safely from customer,
-- phone, email, or account signals. Keep legacy rows unclassified; new application
-- writes supply an explicit source and never rely on a database default.
CREATE TYPE "RentalOrderSource" AS ENUM ('ONLINE', 'OFFLINE');

ALTER TABLE "rental_orders"
  ADD COLUMN "source" "RentalOrderSource",
  ADD COLUMN "web_account_id" UUID;

ALTER TABLE "rental_orders"
  ADD CONSTRAINT "rental_orders_web_account_id_fkey"
  FOREIGN KEY ("web_account_id") REFERENCES "web_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Supports the forthcoming account-owned order history query ordered newest first.
CREATE INDEX "rental_orders_web_account_id_created_at_idx"
  ON "rental_orders" ("web_account_id", "created_at" DESC);
