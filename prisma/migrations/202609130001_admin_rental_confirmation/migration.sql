BEGIN;

CREATE TABLE "rental_confirmations" (
  "order_id" UUID PRIMARY KEY REFERENCES "rental_orders"("id") ON DELETE RESTRICT,
  "shop_id" UUID NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "confirmed_at" TIMESTAMPTZ(6) NOT NULL,
  "confirmed_by" UUID NOT NULL REFERENCES "shop_members"("id") ON DELETE RESTRICT,
  "actor_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "actor_name" VARCHAR(255) NOT NULL,
  "rental_amount" DECIMAL(18,2) NOT NULL CHECK (rental_amount >= 0),
  "collateral_method" VARCHAR(20) NOT NULL,
  "document_type" VARCHAR(20),
  "collateral_amount" DECIMAL(18,2),
  "note" VARCHAR(2000),
  "evidence_key" VARCHAR(500) UNIQUE,
  "evidence_filename" VARCHAR(255),
  "evidence_mime_type" VARCHAR(100),
  "evidence_size" INTEGER,
  CONSTRAINT "confirmation_collateral_check" CHECK (
    (collateral_method = 'CASH' AND document_type IS NULL AND collateral_amount IS NOT NULL AND collateral_amount >= 0)
    OR (collateral_method = 'DOCUMENT' AND document_type IS NOT NULL AND document_type IN ('CCCD', 'GPLX') AND collateral_amount IS NULL)
  ),
  CONSTRAINT "confirmation_evidence_check" CHECK (
    (evidence_key IS NULL AND evidence_filename IS NULL AND evidence_mime_type IS NULL AND evidence_size IS NULL)
    OR (evidence_key IS NOT NULL AND evidence_filename IS NOT NULL AND evidence_mime_type IS NOT NULL AND evidence_size IS NOT NULL AND evidence_mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif') AND evidence_size > 0 AND evidence_size <= 15728640)
  )
);
CREATE INDEX "rental_confirmations_shop_id_confirmed_at_idx" ON "rental_confirmations"("shop_id", "confirmed_at");

INSERT INTO "permissions" ("id", "code", "description")
VALUES (gen_random_uuid(), 'rentals.confirm', 'Xác nhận thủ công đơn thuê và collateral')
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r CROSS JOIN "permissions" p
WHERE r.code IN ('OWNER', 'MANAGER') AND p.code = 'rentals.confirm'
ON CONFLICT DO NOTHING;

COMMIT;
