import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import { paginateMeta } from '@common/types/pagination';
import type {
  FinanceCriteria,
  FinanceReadRepository,
  FinanceSummary,
  FinanceTransaction,
} from '../domain/finance-read.repository';

/** One normalized accounting source shared by summary and table; never union receipts with charges. */
function source(input: FinanceCriteria) {
  return Prisma.sql`
    WITH finalized AS MATERIALIZED (
      SELECT id, order_number, completed_at, grand_total, charges_total
      FROM rental_orders WHERE shop_id = ${input.shopId}::uuid AND status = 'COMPLETED'
        AND completed_at >= ${input.start} AND completed_at < ${input.end}
    ), entries AS (
      SELECT 'rental:' || o.id AS id, o.order_number AS code, o.completed_at AS occurred_at,
        'INCOME' AS direction, 'RENTAL' AS category, 'Tiền thuê sau giảm giá'::text AS description,
        o.grand_total - o.charges_total AS amount, o.id AS order_id, o.order_number AS order_code
      FROM finalized o WHERE o.grand_total <> o.charges_total
      UNION ALL
      SELECT 'charge:' || c.id, o.order_number, o.completed_at, 'INCOME',
        CASE c.charge_type WHEN 'ACCESSORY' THEN 'ACCESSORY' WHEN 'LATE' THEN 'LATE'
          WHEN 'SHIPPING' THEN 'SHIPPING' WHEN 'RENTAL_EXTRA' THEN 'RENTAL'
          WHEN 'CLEANING' THEN 'CLEANING_DAMAGE' WHEN 'REPAIR' THEN 'CLEANING_DAMAGE'
          WHEN 'DAMAGE' THEN 'CLEANING_DAMAGE' WHEN 'LOST_ITEM' THEN 'CLEANING_DAMAGE' ELSE 'OTHER' END,
        LEFT(COALESCE(NULLIF(c.description, ''), CASE c.charge_type
          WHEN 'ACCESSORY' THEN 'Phụ kiện' WHEN 'LATE' THEN 'Phí trả trễ' WHEN 'SHIPPING' THEN 'Phí giao nhận'
          WHEN 'RENTAL_EXTRA' THEN 'Phí thuê thêm' WHEN 'CLEANING' THEN 'Phí vệ sinh'
          WHEN 'REPAIR' THEN 'Phí sửa chữa' WHEN 'DAMAGE' THEN 'Bồi thường hư hỏng'
          WHEN 'LOST_ITEM' THEN 'Bồi thường mất đồ' ELSE 'Phụ thu khác' END), 300),
        c.amount * c.quantity, o.id, o.order_number
      FROM rental_order_charges c JOIN finalized o ON o.id = c.order_id
      WHERE c.shop_id = ${input.shopId}::uuid AND c.voided_at IS NULL AND c.amount <> 0
      UNION ALL
      SELECT 'refund:' || p.id, p.transaction_number, p.paid_at, 'INCOME', 'REFUND',
        LEFT(COALESCE(NULLIF(p.note, ''), 'Hoàn tiền đơn thuê'), 300), -p.amount, o.id, o.order_number
      FROM payment_transactions p JOIN rental_orders o ON o.id = p.order_id AND o.shop_id = ${input.shopId}::uuid
      WHERE p.shop_id = ${input.shopId}::uuid AND p.status = 'COMPLETED' AND p.voided_at IS NULL
        AND p.direction = 'OUT' AND p.purpose = 'ORDER_REFUND' AND o.status = 'COMPLETED'
        AND p.paid_at >= o.completed_at AND p.paid_at >= ${input.start} AND p.paid_at < ${input.end}
      UNION ALL
      SELECT 'expense:' || e.id, e.expense_number,
        e.expense_date::timestamp AT TIME ZONE ${input.period.timezone}, 'EXPENSE', 'EXPENSE',
        LEFT(e.description, 300), e.amount, o.id, o.order_number
      FROM expenses e LEFT JOIN rental_orders o ON o.id = e.order_id AND o.shop_id = ${input.shopId}::uuid
      WHERE e.shop_id = ${input.shopId}::uuid AND e.status = 'PAID' AND e.voided_at IS NULL
        AND e.expense_date >= ${input.period.from}::date
        AND e.expense_date < (${input.period.to}::date + 1)
    ), filtered AS (
      SELECT * FROM entries WHERE TRUE
        ${input.direction ? Prisma.sql`AND direction = ${input.direction}` : Prisma.empty}
        ${input.category ? Prisma.sql`AND category = ${input.category}` : Prisma.empty}
    )`;
}

@Injectable()
export class PrismaFinanceReadRepository implements FinanceReadRepository {
  constructor(private readonly prisma: PrismaService) {}
  async timezone(shopId: string) {
    return (
      await this.prisma.shop.findUniqueOrThrow({
        where: { id: shopId },
        select: { timezone: true },
      })
    ).timezone;
  }
  async summary(input: FinanceCriteria) {
    const [row] = await this.prisma.$queryRaw<Array<Omit<FinanceSummary, 'period'>>>(Prisma.sql`
      ${source(input)}, totals AS (
        SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'INCOME'), 0) AS revenue,
          COALESCE(SUM(amount) FILTER (WHERE direction = 'EXPENSE'), 0) AS expenses FROM filtered
      ), breakdown AS (
        SELECT category, SUM(amount)::text AS amount FROM filtered WHERE direction = 'INCOME' GROUP BY category
      ) SELECT revenue::text AS "totalRevenue", expenses::text AS "totalExpenses",
        (revenue - expenses)::text AS profit,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('category', category, 'amount', amount) ORDER BY category) FROM breakdown), '[]'::jsonb) AS breakdown
      FROM totals
    `);
    if (!row) throw new Error('Finance aggregate returned no row');
    return row;
  }
  async transactions(input: Parameters<FinanceReadRepository['transactions']>[0]) {
    const order = input.sort === 'oldest' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const [row] = await this.prisma.$queryRaw<
      Array<{ items: FinanceTransaction[]; total: number }>
    >(Prisma.sql`
      ${source(input)}, page AS (
        SELECT * FROM filtered ORDER BY occurred_at ${order}, id ${order}
        LIMIT ${input.limit} OFFSET ${(input.page - 1) * input.limit}
      ) SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'code', code, 'occurredAt', occurred_at, 'direction', direction,
          'category', category, 'description', description, 'amount', amount::text,
          'orderId', order_id, 'orderCode', order_code
        ) ORDER BY occurred_at ${order}, id ${order}) FROM page), '[]'::jsonb) AS items
    `);
    if (!row) throw new Error('Finance page returned no row');
    return { items: row.items, meta: paginateMeta(input.page, input.limit, row.total) };
  }
}
