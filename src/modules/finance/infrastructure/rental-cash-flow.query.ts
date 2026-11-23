import { Prisma } from '@prisma/client';

/** Rental receipts and refunds by transaction date, including settled deposit offsets. */
export function rentalCashFlowByDay(input: {
  shopId: string;
  timezone: string;
  from: Date;
  until: Date;
}): Prisma.Sql {
  return Prisma.sql`
    SELECT
      (paid_at AT TIME ZONE ${input.timezone})::date AS day,
      SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) AS revenue
    FROM payment_transactions
    WHERE shop_id = ${input.shopId}::uuid
      AND status = 'COMPLETED'
      AND voided_at IS NULL
      AND purpose NOT IN ('DEPOSIT', 'DEPOSIT_REFUND')
      AND paid_at >= ${input.from}
      AND paid_at < ${input.until}
    GROUP BY 1
  `;
}
