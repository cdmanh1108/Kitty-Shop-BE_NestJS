import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import type { ReportRepository } from '../domain/report.repository';

@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async shopTimezone(shopId: string): Promise<string> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { timezone: true } });
    return shop?.timezone ?? 'Asia/Ho_Chi_Minh';
  }

  revenue(input: { shopId: string; from: Date; until: Date; timezone: string }) {
    return this.prisma.$queryRaw<unknown[]>(Prisma.sql`
      WITH revenue AS (
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
      ), expense AS (
        SELECT expense_date AS day, SUM(amount) AS expense
        FROM expenses
        WHERE shop_id = ${input.shopId}::uuid
          AND status = 'PAID'
          AND voided_at IS NULL
          AND expense_date >= ${input.from}::date
          AND expense_date < ${input.until}::date
        GROUP BY 1
      )
      SELECT
        COALESCE(revenue.day, expense.day) AS "day",
        COALESCE(revenue.revenue, 0)::text AS "revenue",
        COALESCE(expense.expense, 0)::text AS "expense",
        (COALESCE(revenue.revenue, 0) - COALESCE(expense.expense, 0))::text AS "profit"
      FROM revenue
      FULL OUTER JOIN expense ON expense.day = revenue.day
      ORDER BY 1 ASC
    `);
  }

  productPerformance(input: { shopId: string; from: Date; until: Date; limit: number }) {
    return this.prisma.$queryRaw<unknown[]>(Prisma.sql`
      SELECT
        p.id,
        p.code,
        p.name,
        COALESCE(SUM(roi.quantity) FILTER (WHERE ro.id IS NOT NULL), 0)::int AS "rentalCount",
        COALESCE(SUM(roi.line_total) FILTER (WHERE ro.id IS NOT NULL), 0)::text AS "bookedRevenue"
      FROM products p
      LEFT JOIN rental_order_items roi ON roi.product_id = p.id
      LEFT JOIN rental_orders ro ON ro.id = roi.order_id
        AND ro.status = 'COMPLETED'
        AND ro.completed_at >= ${input.from}
        AND ro.completed_at < ${input.until}
      WHERE p.shop_id = ${input.shopId}::uuid
        AND p.archived_at IS NULL
      GROUP BY p.id, p.code, p.name
      ORDER BY COALESCE(SUM(roi.quantity) FILTER (WHERE ro.id IS NOT NULL), 0) DESC,
               COALESCE(SUM(roi.line_total) FILTER (WHERE ro.id IS NOT NULL), 0) DESC
      LIMIT ${input.limit}
    `);
  }

  customerPerformance(input: { shopId: string; from: Date; until: Date; limit: number }) {
    return this.prisma.$queryRaw<unknown[]>(Prisma.sql`
      SELECT
        c.id,
        c.customer_code AS "customerCode",
        c.full_name AS "fullName",
        c.phone,
        COUNT(ro.id)::int AS "rentalCount",
        COALESCE(SUM(ro.grand_total), 0)::text AS "bookedValue"
      FROM customers c
      LEFT JOIN rental_orders ro ON ro.customer_id = c.id
        AND ro.status = 'COMPLETED'
        AND ro.completed_at >= ${input.from}
        AND ro.completed_at < ${input.until}
      WHERE c.shop_id = ${input.shopId}::uuid
        AND c.archived_at IS NULL
      GROUP BY c.id, c.customer_code, c.full_name, c.phone
      ORDER BY COUNT(ro.id) DESC, COALESCE(SUM(ro.grand_total), 0) DESC
      LIMIT ${input.limit}
    `);
  }
}
