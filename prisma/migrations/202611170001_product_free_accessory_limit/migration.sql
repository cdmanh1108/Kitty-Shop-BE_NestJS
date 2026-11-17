ALTER TABLE "products" ADD COLUMN "free_accessory_limit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "products" ADD CONSTRAINT "products_free_accessory_limit_nonnegative" CHECK ("free_accessory_limit" >= 0);
