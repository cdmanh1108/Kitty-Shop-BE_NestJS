-- Refresh-token lineage cannot be reconstructed safely from existing revoked_at values.
-- Invalidate every legacy active token before enforcing the new family invariant.

CREATE TABLE "refresh_token_families" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" VARCHAR(50),
    "reuse_detected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_token_families_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "web_refresh_token_families" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" VARCHAR(50),
    "reuse_detected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "web_refresh_token_families_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "refresh_tokens"
    ADD COLUMN "family_id" UUID,
    ADD COLUMN "parent_token_id" UUID,
    ADD COLUMN "consumed_at" TIMESTAMPTZ(6),
    ADD COLUMN "revocation_reason" VARCHAR(50);

ALTER TABLE "web_refresh_tokens"
    ADD COLUMN "family_id" UUID,
    ADD COLUMN "parent_token_id" UUID,
    ADD COLUMN "consumed_at" TIMESTAMPTZ(6),
    ADD COLUMN "revocation_reason" VARCHAR(50);

UPDATE "refresh_tokens"
SET "revoked_at" = CURRENT_TIMESTAMP,
    "revocation_reason" = 'LEGACY_INVALIDATED'
WHERE "revoked_at" IS NULL;

UPDATE "web_refresh_tokens"
SET "revoked_at" = CURRENT_TIMESTAMP,
    "revocation_reason" = 'LEGACY_INVALIDATED'
WHERE "revoked_at" IS NULL;

UPDATE "refresh_tokens"
SET "family_id" = gen_random_uuid()
WHERE "family_id" IS NULL;

UPDATE "web_refresh_tokens"
SET "family_id" = gen_random_uuid()
WHERE "family_id" IS NULL;

INSERT INTO "refresh_token_families" ("id", "user_id", "member_id", "created_at")
SELECT "family_id", "user_id", "member_id", "created_at"
FROM "refresh_tokens";

INSERT INTO "web_refresh_token_families" ("id", "account_id", "created_at")
SELECT "family_id", "account_id", "created_at"
FROM "web_refresh_tokens";

ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;
ALTER TABLE "web_refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

CREATE UNIQUE INDEX "refresh_tokens_parent_token_id_key"
    ON "refresh_tokens"("parent_token_id");
CREATE INDEX "refresh_tokens_family_id_revoked_at_idx"
    ON "refresh_tokens"("family_id", "revoked_at");
CREATE INDEX "refresh_token_families_user_id_revoked_at_idx"
    ON "refresh_token_families"("user_id", "revoked_at");
CREATE INDEX "refresh_token_families_member_id_revoked_at_idx"
    ON "refresh_token_families"("member_id", "revoked_at");

CREATE UNIQUE INDEX "web_refresh_tokens_parent_token_id_key"
    ON "web_refresh_tokens"("parent_token_id");
CREATE INDEX "web_refresh_tokens_family_id_revoked_at_idx"
    ON "web_refresh_tokens"("family_id", "revoked_at");
CREATE INDEX "web_refresh_token_families_account_id_revoked_at_idx"
    ON "web_refresh_token_families"("account_id", "revoked_at");

ALTER TABLE "refresh_token_families"
    ADD CONSTRAINT "refresh_token_families_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "refresh_token_families_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "shop_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "web_refresh_token_families"
    ADD CONSTRAINT "web_refresh_token_families_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "web_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "refresh_token_families"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "refresh_tokens_parent_token_id_fkey"
    FOREIGN KEY ("parent_token_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "web_refresh_tokens"
    ADD CONSTRAINT "web_refresh_tokens_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "web_refresh_token_families"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "web_refresh_tokens_parent_token_id_fkey"
    FOREIGN KEY ("parent_token_id") REFERENCES "web_refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
