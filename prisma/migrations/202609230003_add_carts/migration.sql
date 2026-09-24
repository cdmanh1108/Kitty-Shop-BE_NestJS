-- Persists storefront rental selections for verified accounts. This is a
-- draft only: quote/order still resolve catalog, price and availability anew.
CREATE TABLE "carts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "items" JSONB NOT NULL,
  "pickup_date" DATE NOT NULL,
  "return_date" DATE NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "carts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "carts_account_id_shop_id_key" UNIQUE ("account_id", "shop_id"),
  CONSTRAINT "carts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "web_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "carts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "carts_valid_period" CHECK ("pickup_date" < "return_date"),
  CONSTRAINT "carts_non_negative_version" CHECK ("version" > 0)
);

CREATE INDEX "carts_shop_id_updated_at_idx" ON "carts"("shop_id", "updated_at");
