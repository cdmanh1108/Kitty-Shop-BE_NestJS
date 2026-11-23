BEGIN;

ALTER TABLE "rental_orders"
  DROP COLUMN "collateral_method",
  DROP COLUMN "document_type",
  DROP COLUMN "collateral_status",
  DROP COLUMN "collateral_received_at",
  DROP COLUMN "collateral_returned_at";

ALTER TABLE "rental_confirmations"
  DROP CONSTRAINT "confirmation_collateral_check",
  DROP COLUMN "collateral_method",
  DROP COLUMN "document_type",
  ALTER COLUMN "collateral_amount" SET NOT NULL,
  ADD CONSTRAINT "confirmation_deposit_amount_check" CHECK ("collateral_amount" BETWEEN 0 AND 100000000);

ALTER TABLE "rental_settlements"
  DROP CONSTRAINT "rental_settlements_settlement_type_check",
  ADD CONSTRAINT "rental_settlements_settlement_type_check"
    CHECK ("settlement_type" IN ('REFUND', 'PAYMENT', 'COLLECTION', 'BALANCED'));

COMMIT;
