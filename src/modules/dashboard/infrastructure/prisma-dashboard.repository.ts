import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import { RENTAL_STATUS, ALLOCATION_STATUS } from '@modules/rentals/domain/rental-status';
import type { DashboardRepository, DashboardSummaryData } from '../domain/dashboard.repository';
import type { DashboardSummary } from '../domain/dashboard.models';

type Operations = Omit<DashboardSummary, 'revenueToday' | 'revenueMonth' | 'revenueSeries'>;
type Revenue = Pick<DashboardSummary, 'revenueToday' | 'revenueMonth' | 'revenueSeries'>;

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getShopTimezone(shopId: string): Promise<string> {
    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { timezone: true },
    });
    return shop.timezone;
  }

  async summary(input: DashboardSummaryData): Promise<DashboardSummary> {
    const [revenue, operations] = await Promise.all([this.revenue(input), this.operations(input)]);
    return { ...revenue, ...operations };
  }

  private async revenue(input: DashboardSummaryData): Promise<Revenue> {
    // Same ledger semantics as Finance/Reports: net completed, non-voided,
    // non-deposit movements, including internal deposit-to-rental offsets.
    const from = input.seriesStart < input.monthStart ? input.seriesStart : input.monthStart;
    const [row] = await this.prisma.$queryRaw<Revenue[]>(Prisma.sql`
      WITH daily AS (
        SELECT (paid_at AT TIME ZONE ${input.timezone})::date AS day,
          SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END) AS revenue
        FROM payment_transactions
        WHERE shop_id = ${input.shopId}::uuid AND status = 'COMPLETED'
          AND voided_at IS NULL AND purpose NOT IN ('DEPOSIT', 'DEPOSIT_REFUND')
          AND paid_at >= ${from} AND paid_at < ${input.monthEnd}
        GROUP BY 1
      ), series AS (
        SELECT d::date AS day, COALESCE(daily.revenue, 0) AS revenue
        FROM generate_series(
          (${input.seriesStart}::timestamptz AT TIME ZONE ${input.timezone})::date::timestamp,
          (${input.dayStart}::timestamptz AT TIME ZONE ${input.timezone})::date::timestamp,
          interval '1 day') d
        LEFT JOIN daily ON daily.day = d::date
      )
      SELECT
        COALESCE((SELECT revenue FROM daily WHERE day = (${input.dayStart}::timestamptz AT TIME ZONE ${input.timezone})::date), 0)::float8 AS "revenueToday",
        COALESCE((SELECT SUM(revenue) FROM daily WHERE day >= (${input.monthStart}::timestamptz AT TIME ZONE ${input.timezone})::date), 0)::float8 AS "revenueMonth",
        (SELECT jsonb_agg(jsonb_build_object('date', day, 'revenue', revenue) ORDER BY day) FROM series) AS "revenueSeries"
    `);
    if (!row) throw new Error('Dashboard aggregate returned no row');
    return row;
  }

  private async operations(input: DashboardSummaryData): Promise<Operations> {
    const active = RENTAL_STATUS.ACTIVE;
    const returned = RENTAL_STATUS.RETURNED;
    const [row] = await this.prisma.$queryRaw<Operations[]>(Prisma.sql`
      WITH open_orders AS MATERIALIZED (
        SELECT id, order_number, customer_id, rental_start_at, rental_end_at,
          status, grand_total
        FROM rental_orders
        WHERE shop_id = ${input.shopId}::uuid
          AND status IN (${RENTAL_STATUS.RESERVED}, ${RENTAL_STATUS.CONFIRMED}, ${active}, ${returned})
      ), paid AS (
        SELECT p.order_id, SUM(CASE WHEN p.direction = 'IN' THEN p.amount ELSE -p.amount END) AS net
        FROM payment_transactions p JOIN open_orders o ON o.id = p.order_id
        WHERE p.shop_id = ${input.shopId}::uuid AND p.status = 'COMPLETED'
          AND p.voided_at IS NULL AND p.purpose NOT IN ('DEPOSIT', 'DEPOSIT_REFUND')
        GROUP BY p.order_id
      ), balances AS MATERIALIZED (
        SELECT o.*, GREATEST(0, o.grand_total - COALESCE(p.net, 0)) AS outstanding,
          CASE WHEN o.status = ${active} AND o.rental_end_at < ${input.now} THEN 'OVERDUE'
            WHEN o.status = ${returned} THEN 'RETURN_SETTLEMENT'
            WHEN o.grand_total > COALESCE(p.net, 0) THEN 'OUTSTANDING'
          END AS action
        FROM open_orders o LEFT JOIN paid p ON p.order_id = o.id
      ), upcoming AS (
        SELECT * FROM open_orders
        WHERE status IN (${RENTAL_STATUS.RESERVED}, ${RENTAL_STATUS.CONFIRMED})
          AND rental_start_at >= ${input.dayStart}
        ORDER BY rental_start_at, id LIMIT 6
      ), quantities AS (
        SELECT i.order_id, SUM(i.quantity)::int AS quantity
        FROM rental_order_items i JOIN upcoming u ON u.id = i.order_id
        WHERE i.shop_id = ${input.shopId}::uuid GROUP BY i.order_id
      ), attention AS (
        SELECT * FROM balances WHERE action IS NOT NULL
        ORDER BY CASE action WHEN 'OVERDUE' THEN 0 WHEN 'RETURN_SETTLEMENT' THEN 1 ELSE 2 END,
          rental_end_at, id LIMIT 6
      )
      SELECT
        (SELECT COUNT(*)::int FROM rental_orders WHERE shop_id = ${input.shopId}::uuid
          AND status NOT IN (${RENTAL_STATUS.DRAFT}, ${RENTAL_STATUS.CANCELLED})
          AND rental_start_at >= ${input.dayStart} AND rental_start_at < ${input.dayEnd}) AS "ordersToday",
        (SELECT COUNT(*)::int FROM rental_item_allocations WHERE shop_id = ${input.shopId}::uuid
          AND status = ${ALLOCATION_STATUS.ACTIVE} AND released_at IS NULL) AS "rentingProducts",
        COUNT(*) FILTER (WHERE status = ${active} AND rental_end_at >= ${input.now} AND rental_end_at < ${input.dueSoonEnd})::int AS "dueSoon",
        COUNT(*) FILTER (WHERE action = 'OVERDUE')::int AS "overdueOrders",
        COALESCE(SUM(outstanding), 0)::float8 AS "outstandingAmount",
        COUNT(*) FILTER (WHERE action IS NOT NULL)::int AS "actionRequiredOrders",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', u.id, 'code', u.order_number, 'customerName', c.full_name,
          'pickupDate', u.rental_start_at, 'status', u.status, 'itemCount', COALESCE(q.quantity, 0)
        ) ORDER BY u.rental_start_at, u.id)
          FROM upcoming u JOIN customers c ON c.id = u.customer_id AND c.shop_id = ${input.shopId}::uuid
          LEFT JOIN quantities q ON q.order_id = u.id), '[]'::jsonb) AS "upcomingOrders",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'code', a.order_number, 'customerName', c.full_name,
          'returnDate', a.rental_end_at, 'status', a.status,
          'outstandingAmount', a.outstanding, 'type', a.action
        ) ORDER BY CASE a.action WHEN 'OVERDUE' THEN 0 WHEN 'RETURN_SETTLEMENT' THEN 1 ELSE 2 END, a.rental_end_at, a.id)
          FROM attention a JOIN customers c ON c.id = a.customer_id AND c.shop_id = ${input.shopId}::uuid), '[]'::jsonb) AS "attentionOrders"
      FROM balances
    `);
    if (!row) throw new Error('Dashboard aggregate returned no row');
    return row;
  }
}
