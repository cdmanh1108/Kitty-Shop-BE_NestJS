CREATE TABLE "favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorites_account_id_product_id_key"
    ON "favorites"("account_id", "product_id");

CREATE INDEX "favorites_account_id_created_at_idx"
    ON "favorites"("account_id", "created_at" DESC);

ALTER TABLE "favorites"
    ADD CONSTRAINT "favorites_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "web_accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorites"
    ADD CONSTRAINT "favorites_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
