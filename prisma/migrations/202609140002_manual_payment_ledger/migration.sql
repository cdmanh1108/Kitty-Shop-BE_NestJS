ALTER TABLE payment_transactions
  ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN receipt_key VARCHAR(100),
  ADD COLUMN provider VARCHAR(50),
  ADD COLUMN provider_transaction_id VARCHAR(255);
ALTER TABLE payment_transactions ALTER COLUMN source SET DEFAULT 'ADMIN_MANUAL';
CREATE UNIQUE INDEX payment_transactions_receipt_key_key ON payment_transactions(receipt_key);
CREATE UNIQUE INDEX payment_transactions_provider_provider_transaction_id_key
  ON payment_transactions(provider, provider_transaction_id);
ALTER TABLE payment_transactions ADD CONSTRAINT payment_source_check
  CHECK (source IN ('LEGACY', 'ADMIN_MANUAL', 'ONLINE_WEBHOOK', 'INTERNAL_TRANSFER'));

-- Preserve historical confirmations as receipts without inventing their payment method.
-- Subtract existing incoming receipts; refunds must not cause a second collection.
INSERT INTO payment_transactions
  (shop_id, order_id, customer_id, transaction_number, receipt_key, source,
   direction, purpose, payment_method, amount, paid_at, created_by, note)
SELECT c.shop_id, c.order_id, o.customer_id, v.key || c.order_id, v.key || c.order_id,
  'LEGACY', 'IN', v.purpose, 'UNSPECIFIED', v.amount, c.confirmed_at, c.confirmed_by,
  'Khôi phục khoản thực nhận từ biên bản xác nhận đơn trước khi dùng sổ giao dịch chung.'
FROM rental_confirmations c JOIN rental_orders o ON o.id = c.order_id
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(amount) FILTER (WHERE purpose NOT IN ('DEPOSIT', 'DEPOSIT_REFUND')), 0) rental,
    COALESCE(SUM(amount) FILTER (WHERE purpose = 'DEPOSIT'), 0) deposit
  FROM payment_transactions p WHERE p.order_id = c.order_id AND p.status = 'COMPLETED'
    AND p.voided_at IS NULL AND p.direction = 'IN'
) p
CROSS JOIN LATERAL (VALUES
  ('RC-R-', 'RENTAL_PAYMENT', GREATEST(0, c.rental_amount - p.rental)),
  ('RC-D-', 'DEPOSIT', GREATEST(0, COALESCE(c.collateral_amount, 0) - p.deposit))
) v(key, purpose, amount)
WHERE v.amount > 0;

-- Keep the actual historical settlement amounts, even if an old calculation was wrong.
-- Never rewrite the signed settlement record or pretend to collect its discrepancy.
INSERT INTO payment_transactions
  (shop_id, order_id, customer_id, transaction_number, receipt_key, source,
   direction, purpose, payment_method, amount, paid_at, created_by, note)
SELECT s.shop_id, s.order_id, o.customer_id, v.key || s.order_id, v.key || s.order_id,
  v.source, v.direction, v.purpose, v.method, v.amount, s.settled_at, s.settled_by,
  'Khôi phục giao dịch theo biên bản kết toán đã lưu.'
FROM rental_settlements s JOIN rental_orders o ON o.id = s.order_id
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(amount) FILTER (WHERE purpose IN ('DEPOSIT', 'DEPOSIT_REFUND') AND direction='OUT'), 0) returned,
    COALESCE(SUM(amount) FILTER (WHERE purpose NOT IN ('DEPOSIT', 'DEPOSIT_REFUND') AND direction='IN' AND paid_at >= s.settled_at), 0) collected
  FROM payment_transactions p WHERE p.order_id = s.order_id AND p.status='COMPLETED' AND p.voided_at IS NULL
) p
CROSS JOIN LATERAL (VALUES
  ('RS-F-', 'LEGACY', 'OUT', 'DEPOSIT_REFUND', 'UNSPECIFIED', GREATEST(0, s.refund_amount - p.returned)),
  ('RS-D-', 'INTERNAL_TRANSFER', 'OUT', 'DEPOSIT', 'DEPOSIT_OFFSET', GREATEST(0, s.deposit_amount - GREATEST(s.refund_amount, p.returned))),
  ('RS-R-', 'INTERNAL_TRANSFER', 'IN', 'RENTAL_PAYMENT', 'DEPOSIT_OFFSET', GREATEST(0, s.deposit_amount - GREATEST(s.refund_amount, p.returned))),
  ('RS-C-', 'LEGACY', 'IN', 'RENTAL_PAYMENT', 'UNSPECIFIED', GREATEST(0, s.amount_due - p.collected))
) v(key, source, direction, purpose, method, amount)
WHERE v.amount > 0;

WITH totals AS (
  SELECT o.id, o.grand_total, COALESCE(c.collateral_amount, 0) required,
    COALESCE(SUM(CASE WHEN p.purpose NOT IN ('DEPOSIT','DEPOSIT_REFUND') THEN
      CASE WHEN p.direction='IN' THEN p.amount ELSE -p.amount END ELSE 0 END), 0) paid,
    COALESCE(SUM(p.amount) FILTER (WHERE p.purpose IN ('DEPOSIT','DEPOSIT_REFUND') AND p.direction='IN'), 0) deposit_in,
    COALESCE(SUM(p.amount) FILTER (WHERE p.purpose IN ('DEPOSIT','DEPOSIT_REFUND') AND p.direction='OUT'), 0) deposit_out
  FROM rental_orders o JOIN rental_confirmations c ON c.order_id=o.id
  LEFT JOIN payment_transactions p ON p.order_id=o.id AND p.status='COMPLETED' AND p.voided_at IS NULL
  GROUP BY o.id, c.collateral_amount
)
UPDATE rental_orders o SET
  payment_status=CASE WHEN t.paid >= t.grand_total THEN 'PAID' WHEN t.paid > 0 THEN 'PARTIALLY_PAID' ELSE 'UNPAID' END,
  deposit_status=CASE WHEN t.required <= 0 THEN 'NOT_REQUIRED'
    WHEN t.deposit_out > 0 AND t.deposit_in <= t.deposit_out THEN 'REFUNDED'
    WHEN t.deposit_out > 0 THEN 'PARTIALLY_REFUNDED'
    WHEN t.deposit_in >= t.required THEN 'HELD'
    WHEN t.deposit_in > 0 THEN 'PARTIALLY_HELD' ELSE 'PENDING' END
FROM totals t WHERE o.id=t.id;

ALTER TABLE rental_settlements DROP CONSTRAINT rental_settlements_settlement_type_check;
ALTER TABLE rental_settlements ADD CONSTRAINT rental_settlements_settlement_type_check
  CHECK (settlement_type IN ('REFUND', 'PAYMENT', 'COLLECTION', 'BALANCED', 'COLLATERAL_ONLY'));
