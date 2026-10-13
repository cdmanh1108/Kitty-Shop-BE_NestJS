ALTER TABLE "carts"
  ALTER COLUMN "pickup_date" TYPE TIMESTAMPTZ(6)
  USING (("pickup_date" + TIME '08:30:00') AT TIME ZONE 'Asia/Ho_Chi_Minh');

ALTER TABLE "carts"
  ALTER COLUMN "return_date" TYPE TIMESTAMPTZ(6)
  USING (("return_date" + TIME '08:30:00') AT TIME ZONE 'Asia/Ho_Chi_Minh');
