ALTER TABLE "products" ADD COLUMN "rental_price_override" DECIMAL(18,2);
ALTER TABLE "products" ADD CONSTRAINT "products_rental_price_override_check"
CHECK ("rental_price_override" IS NULL OR ("rental_price_override" >= 0 AND "rental_price_override" <= 100000000));
