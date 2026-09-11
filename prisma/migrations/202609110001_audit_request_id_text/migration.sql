-- Middleware already accepts non-UUID correlation IDs up to 100 ASCII characters.
-- Preserve existing UUID values and persist the same ID; do not generate a second audit ID.
ALTER TABLE "audit_logs" ALTER COLUMN "request_id" TYPE VARCHAR(100) USING "request_id"::text;
