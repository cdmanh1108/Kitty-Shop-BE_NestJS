BEGIN;

CREATE TYPE "customer_loyalty_owner_type" AS ENUM ('CRM_CUSTOMER', 'WEB_ACCOUNT');
CREATE TYPE "customer_loyalty_reward_status" AS ENUM ('AVAILABLE', 'REDEEMED', 'REVOKED');

ALTER TABLE "customer_loyalty_entries"
  ADD COLUMN "owner_type" "customer_loyalty_owner_type" NOT NULL DEFAULT 'CRM_CUSTOMER',
  ADD COLUMN "web_account_id" UUID;

ALTER TABLE "customer_loyalty_entries"
  ADD CONSTRAINT "customer_loyalty_entries_web_account_id_fkey"
  FOREIGN KEY ("web_account_id") REFERENCES "web_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_loyalty_entries"
  ADD CONSTRAINT "customer_loyalty_entries_owner_check" CHECK (
    ("owner_type" = 'CRM_CUSTOMER' AND "web_account_id" IS NULL)
    OR ("owner_type" = 'WEB_ACCOUNT' AND "web_account_id" IS NOT NULL)
  );

DROP INDEX "customer_loyalty_entries_shop_id_customer_id_created_at_idx";
CREATE INDEX "customer_loyalty_entries_shop_id_owner_customer_created_at_idx"
  ON "customer_loyalty_entries"("shop_id", "owner_type", "customer_id", "created_at");
CREATE INDEX "customer_loyalty_entries_shop_id_owner_account_created_at_idx"
  ON "customer_loyalty_entries"("shop_id", "owner_type", "web_account_id", "created_at");

CREATE TABLE "customer_loyalty_rewards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "owner_type" "customer_loyalty_owner_type" NOT NULL,
  "web_account_id" UUID,
  "earned_entry_id" UUID NOT NULL,
  "earned_order_id" UUID NOT NULL,
  "reward_value" DECIMAL(18,2) NOT NULL,
  "status" "customer_loyalty_reward_status" NOT NULL DEFAULT 'AVAILABLE',
  "redeemed_order_id" UUID,
  "redeemed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_loyalty_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_loyalty_rewards_reward_value_check" CHECK ("reward_value" > 0),
  CONSTRAINT "customer_loyalty_rewards_owner_check" CHECK (
    ("owner_type" = 'CRM_CUSTOMER' AND "web_account_id" IS NULL)
    OR ("owner_type" = 'WEB_ACCOUNT' AND "web_account_id" IS NOT NULL)
  ),
  CONSTRAINT "customer_loyalty_rewards_status_check" CHECK (
    ("status" = 'AVAILABLE' AND "redeemed_order_id" IS NULL AND "redeemed_at" IS NULL)
    OR ("status" = 'REDEEMED' AND "redeemed_order_id" IS NOT NULL AND "redeemed_at" IS NOT NULL)
    OR "status" = 'REVOKED'
  )
);

CREATE UNIQUE INDEX "customer_loyalty_rewards_earned_order_id_key"
  ON "customer_loyalty_rewards"("earned_order_id");
CREATE UNIQUE INDEX "customer_loyalty_rewards_earned_entry_id_key"
  ON "customer_loyalty_rewards"("earned_entry_id");
CREATE UNIQUE INDEX "customer_loyalty_rewards_redeemed_order_id_key"
  ON "customer_loyalty_rewards"("redeemed_order_id");
CREATE INDEX "customer_loyalty_rewards_customer_status_idx"
  ON "customer_loyalty_rewards"("shop_id", "owner_type", "customer_id", "status", "created_at");
CREATE INDEX "customer_loyalty_rewards_account_status_idx"
  ON "customer_loyalty_rewards"("shop_id", "owner_type", "web_account_id", "status", "created_at");

ALTER TABLE "customer_loyalty_rewards"
  ADD CONSTRAINT "customer_loyalty_rewards_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_loyalty_rewards_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_loyalty_rewards_web_account_id_fkey"
  FOREIGN KEY ("web_account_id") REFERENCES "web_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_loyalty_rewards_earned_entry_id_fkey"
  FOREIGN KEY ("earned_entry_id") REFERENCES "customer_loyalty_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_loyalty_rewards_earned_order_id_fkey"
  FOREIGN KEY ("earned_order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_loyalty_rewards_redeemed_order_id_fkey"
  FOREIGN KEY ("redeemed_order_id") REFERENCES "rental_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rebuild qualification history from completed orders. Web-owned orders accrue
-- to the authenticated account; orders without an account remain in CRM scope.
WITH completed_orders AS (
  SELECT
    o."id" AS "order_id",
    o."shop_id",
    o."customer_id",
    o."web_account_id",
    o."completed_at",
    CASE WHEN o."web_account_id" IS NULL THEN 'CRM_CUSTOMER'::"customer_loyalty_owner_type"
      ELSE 'WEB_ACCOUNT'::"customer_loyalty_owner_type"
    END AS "owner_type",
    ROW_NUMBER() OVER (
      PARTITION BY
        o."shop_id",
        CASE WHEN o."web_account_id" IS NULL THEN 'CRM_CUSTOMER' ELSE 'WEB_ACCOUNT' END,
        COALESCE(o."web_account_id", o."customer_id")
      ORDER BY o."completed_at", o."id"
    ) AS "cycle_position"
  FROM "rental_orders" o
  WHERE o."status" = 'COMPLETED' AND o."completed_at" IS NOT NULL
)
INSERT INTO "customer_loyalty_entries" (
  "shop_id", "customer_id", "order_id", "entry_type", "owner_type",
  "web_account_id", "reward_value", "created_at"
)
SELECT
  "shop_id", "customer_id", "order_id", 'QUALIFIED', "owner_type",
  CASE WHEN "owner_type" = 'WEB_ACCOUNT' THEN "web_account_id" ELSE NULL END,
  CASE WHEN "cycle_position" % 5 = 0 THEN 50000 ELSE 0 END,
  "completed_at"
FROM completed_orders
ON CONFLICT ("order_id") DO UPDATE SET
  "shop_id" = EXCLUDED."shop_id",
  "customer_id" = EXCLUDED."customer_id",
  "entry_type" = EXCLUDED."entry_type",
  "owner_type" = EXCLUDED."owner_type",
  "web_account_id" = EXCLUDED."web_account_id",
  "reward_value" = EXCLUDED."reward_value",
  "created_at" = EXCLUDED."created_at";

INSERT INTO "customer_loyalty_rewards" (
  "shop_id", "customer_id", "owner_type", "web_account_id", "earned_entry_id",
  "earned_order_id", "reward_value", "created_at"
)
SELECT
  e."shop_id", e."customer_id", e."owner_type", e."web_account_id", e."id",
  e."order_id", e."reward_value", e."created_at"
FROM "customer_loyalty_entries" e
JOIN "rental_orders" o ON o."id" = e."order_id"
WHERE e."entry_type" = 'QUALIFIED'
  AND e."reward_value" > 0
  AND o."status" = 'COMPLETED'
  AND o."completed_at" IS NOT NULL
ON CONFLICT ("earned_order_id") DO NOTHING;

COMMIT;
