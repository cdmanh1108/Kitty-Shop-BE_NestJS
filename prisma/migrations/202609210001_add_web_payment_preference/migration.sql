ALTER TABLE "rental_orders"
ADD COLUMN "preferred_payment_method" VARCHAR(30);

ALTER TABLE "rental_orders"
ADD CONSTRAINT "rental_orders_preferred_payment_method_check"
CHECK (
  "preferred_payment_method" IS NULL
  OR "preferred_payment_method" IN ('cash', 'bank_transfer', 'momo')
);
