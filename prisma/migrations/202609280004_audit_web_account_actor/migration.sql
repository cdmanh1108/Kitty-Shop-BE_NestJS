-- Storefront actors are distinct from staff User/ShopMember identities.
-- Keep this nullable so historical admin/system audit records remain valid.
ALTER TABLE "audit_logs"
ADD COLUMN "actor_web_account_id" UUID;

ALTER TABLE "audit_logs"
ADD CONSTRAINT "audit_logs_actor_web_account_id_fkey"
FOREIGN KEY ("actor_web_account_id") REFERENCES "web_accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_logs_actor_web_account_id_created_at_idx"
ON "audit_logs"("actor_web_account_id", "created_at");
