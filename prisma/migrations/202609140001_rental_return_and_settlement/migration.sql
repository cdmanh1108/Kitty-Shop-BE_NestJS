BEGIN;

-- Add actual_returned_at column to rental_orders
ALTER TABLE "rental_orders"
  ADD COLUMN "actual_returned_at" TIMESTAMPTZ(6);

-- Table: rental_returns
CREATE TABLE "rental_returns" (
  "order_id" UUID PRIMARY KEY REFERENCES "rental_orders"("id") ON DELETE RESTRICT,
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "returned_at" TIMESTAMPTZ(6) NOT NULL,
  "received_by" UUID NOT NULL REFERENCES "shop_members"("id") ON DELETE RESTRICT,
  "actor_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "actor_name" VARCHAR(255) NOT NULL,
  "late_days" INTEGER NOT NULL DEFAULT 0 CHECK ("late_days" >= 0),
  "late_fee" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("late_fee" >= 0),
  "additional_rental" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("additional_rental" >= 0),
  "note" VARCHAR(2000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "rental_returns_shop_id_returned_at_idx" ON "rental_returns"("shop_id", "returned_at");

-- Table: rental_return_inspections
CREATE TABLE "rental_return_inspections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL REFERENCES "rental_returns"("order_id") ON DELETE CASCADE,
  "inventory_item_id" UUID NOT NULL REFERENCES "inventory_items"("id") ON DELETE RESTRICT,
  "condition" VARCHAR(30) NOT NULL CHECK ("condition" IN ('NORMAL', 'CLEANING_REQUIRED', 'REPAIR_REQUIRED', 'DAMAGED', 'LOST')),
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "rental_return_inspections_order_id_idx" ON "rental_return_inspections"("order_id");
CREATE INDEX "rental_return_inspections_inventory_item_id_idx" ON "rental_return_inspections"("inventory_item_id");

-- Table: rental_settlements
CREATE TABLE "rental_settlements" (
  "order_id" UUID PRIMARY KEY REFERENCES "rental_orders"("id") ON DELETE RESTRICT,
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "settled_at" TIMESTAMPTZ(6) NOT NULL,
  "settled_by" UUID NOT NULL REFERENCES "shop_members"("id") ON DELETE RESTRICT,
  "actor_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "actor_name" VARCHAR(255) NOT NULL,
  "settlement_type" VARCHAR(30) NOT NULL CHECK ("settlement_type" IN ('REFUND', 'PAYMENT', 'BALANCED')),
  "amount" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("amount" >= 0),
  "deposit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("deposit_amount" >= 0),
  "total_charges" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("total_charges" >= 0),
  "refund_amount" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("refund_amount" >= 0),
  "amount_due" DECIMAL(18,2) NOT NULL DEFAULT 0 CHECK ("amount_due" >= 0),
  "note" VARCHAR(2000),
  "evidence_key" VARCHAR(500) UNIQUE,
  "evidence_filename" VARCHAR(255),
  "evidence_mime_type" VARCHAR(100),
  "evidence_size" INTEGER,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_evidence_check" CHECK (
    ("evidence_key" IS NULL AND "evidence_filename" IS NULL AND "evidence_mime_type" IS NULL AND "evidence_size" IS NULL)
    OR ("evidence_key" IS NOT NULL AND "evidence_filename" IS NOT NULL AND "evidence_mime_type" IS NOT NULL AND "evidence_size" IS NOT NULL AND "evidence_mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif') AND "evidence_size" > 0 AND "evidence_size" <= 15728640)
  )
);
CREATE INDEX "rental_settlements_shop_id_settled_at_idx" ON "rental_settlements"("shop_id", "settled_at");

-- Permissions: rentals.return and rentals.settle
INSERT INTO "permissions" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'rentals.return', 'Nhận đồ trả và kiểm tra đơn thuê'),
  (gen_random_uuid(), 'rentals.settle', 'Kết toán thủ công đơn thuê')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r CROSS JOIN "permissions" p
WHERE r.code IN ('OWNER', 'MANAGER') AND p.code IN ('rentals.return', 'rentals.settle')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r CROSS JOIN "permissions" p
WHERE r.code = 'STAFF' AND p.code = 'rentals.return'
ON CONFLICT DO NOTHING;

COMMIT;
