import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { paginateMeta } from '@common/types/pagination';
import { DEPOSIT_STATUS, ORDER_PAYMENT_STATUS } from '@modules/finance/public/payment-status';
import { RENTAL_STATUS } from '@modules/rentals/public/rental-status';
import type { ReminderRepository } from '../domain/reminder.repository';

@Injectable()
export class PrismaReminderRepository implements ReminderRepository {
  constructor(private readonly prisma: PrismaService) {}

  activeShops() {
    return this.prisma.shop.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, timezone: true },
    });
  }

  async candidatePage(input: Parameters<ReminderRepository['candidatePage']>[0]) {
    const orders = await this.prisma.rentalOrder.findMany({
      where: {
        shopId: input.shopId,
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        // Lossless coarse workset. Exact reminder classification remains in ReminderService.
        OR: [
          {
            status: { in: [RENTAL_STATUS.RESERVED, RENTAL_STATUS.CONFIRMED] },
            rentalStartAt: { gte: input.dayStart, lt: input.dayEnd },
          },
          {
            status: { in: [RENTAL_STATUS.CONFIRMED, RENTAL_STATUS.ACTIVE] },
            rentalEndAt: { lte: input.returnSoonEnd },
          },
          {
            status: {
              in: [
                RENTAL_STATUS.RESERVED,
                RENTAL_STATUS.CONFIRMED,
                RENTAL_STATUS.ACTIVE,
                RENTAL_STATUS.COMPLETED,
              ],
            },
            paymentStatus: { not: ORDER_PAYMENT_STATUS.PAID },
          },
          {
            status: { in: [RENTAL_STATUS.RESERVED, RENTAL_STATUS.CONFIRMED] },
            depositRequired: { gt: 0 },
            depositStatus: { in: [DEPOSIT_STATUS.PENDING, DEPOSIT_STATUS.PARTIALLY_HELD] },
          },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        depositStatus: true,
        depositRequired: true,
        rentalStartAt: true,
        rentalEndAt: true,
        customerId: true,
        customer: { select: { fullName: true, phone: true } },
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
    });
    const hasNextPage = orders.length > input.limit;
    const pageOrders = hasNextPage ? orders.slice(0, input.limit) : orders;
    const items = pageOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      depositStatus: order.depositStatus,
      depositRequired: decimalToNumber(order.depositRequired),
      rentalStartAt: order.rentalStartAt,
      rentalEndAt: order.rentalEndAt,
      customerId: order.customerId,
      customerName: order.customer.fullName,
      customerPhone: order.customer.phone,
    }));
    return {
      items,
      nextCursor: hasNextPage ? (pageOrders.at(-1)?.id ?? null) : null,
    };
  }

  async upsert(input: Parameters<ReminderRepository['upsert']>[0]): Promise<void> {
    await this.prisma.reminder.upsert({
      where: { shopId_dedupeKey: { shopId: input.shopId, dedupeKey: input.dedupeKey } },
      create: { ...input, status: 'PENDING' },
      update: {
        type: input.type,
        scheduledFor: input.scheduledFor,
        priority: input.priority,
        title: input.title,
        content: input.content,
      },
    });
  }

  async resolveMissing(shopId: string, activeKeys: string[]): Promise<number> {
    const result = await this.prisma.reminder.updateMany({
      where: {
        shopId,
        status: 'PENDING',
        type: {
          in: [
            'PICKUP_TODAY',
            'RETURN_TODAY',
            'RETURN_SOON',
            'OVERDUE',
            'PAYMENT_DUE',
            'DEPOSIT_DUE',
          ],
        },
        ...(activeKeys.length > 0 ? { dedupeKey: { notIn: activeKeys } } : {}),
      },
      data: { status: 'RESOLVED', processedAt: new Date() },
    });
    return result.count;
  }

  async list(input: Parameters<ReminderRepository['list']>[0]) {
    const search = input.search?.trim();
    const statusFilter = input.status ? Prisma.sql`AND r.status = ${input.status}` : Prisma.empty;
    const typeFilter = input.type ? Prisma.sql`AND r.type = ${input.type}` : Prisma.empty;
    const searchFilter = search
      ? Prisma.sql`AND (
          strpos(unaccent(lower(r.title)), unaccent(lower(${search}))) > 0
          OR strpos(unaccent(lower(coalesce(r.content, ''))), unaccent(lower(${search}))) > 0
          OR strpos(unaccent(lower(coalesce(c.full_name, ''))), unaccent(lower(${search}))) > 0
          OR strpos(unaccent(lower(coalesce(c.phone, ''))), unaccent(lower(${search}))) > 0
          OR strpos(unaccent(lower(coalesce(o.order_number, ''))), unaccent(lower(${search}))) > 0
        )`
      : Prisma.empty;
    const searchJoins = search
      ? Prisma.sql`LEFT JOIN customers c ON c.id = r.customer_id AND c.shop_id = r.shop_id
                   LEFT JOIN rental_orders o ON o.id = r.order_id AND o.shop_id = r.shop_id`
      : Prisma.empty;
    const fromAndFilters = Prisma.sql`
      FROM reminders r
      ${searchJoins}
      WHERE r.shop_id = ${input.shopId}::uuid
        ${statusFilter}
        ${typeFilter}
        ${searchFilter}
    `;

    return this.prisma.$transaction(async (transaction) => {
      const [pageRows, countRows, typeCounts] = await Promise.all([
        transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT r.id
          ${fromAndFilters}
          ORDER BY r.priority DESC, r.scheduled_for ASC, r.id ASC
          LIMIT ${input.limit} OFFSET ${(input.page - 1) * input.limit}
        `),
        transaction.$queryRaw<Array<{ total: number }>>(Prisma.sql`
          SELECT count(DISTINCT r.id)::int AS total
          ${fromAndFilters}
        `),
        transaction.$queryRaw<Array<{ type: string; count: number }>>(Prisma.sql`
          SELECT type, count(*)::int AS count
          FROM reminders
          WHERE shop_id = ${input.shopId}::uuid
            ${input.status ? Prisma.sql`AND status = ${input.status}` : Prisma.empty}
          GROUP BY type
        `),
      ]);
      const rows = pageRows.length
        ? await transaction.reminder.findMany({
            where: { shopId: input.shopId, id: { in: pageRows.map((row) => row.id) } },
            include: {
              customer: { select: { fullName: true, phone: true } },
              order: { select: { orderNumber: true, status: true } },
            },
          })
        : [];
      const byId = new Map(rows.map((row) => [row.id, row]));
      const items = pageRows.flatMap((row) => {
        const item = byId.get(row.id);
        return item ? [item] : [];
      });
      const total = countRows[0]?.total ?? 0;
      const countByType = new Map(typeCounts.map((row) => [row.type, row.count]));
      return {
        items,
        meta: paginateMeta(input.page, input.limit, total),
        summary: {
          pickupToday: countByType.get('PICKUP_TODAY') ?? 0,
          returnToday: countByType.get('RETURN_TODAY') ?? 0,
          overdue: countByType.get('OVERDUE') ?? 0,
          paymentDue: countByType.get('PAYMENT_DUE') ?? 0,
          depositDue: countByType.get('DEPOSIT_DUE') ?? 0,
        },
      };
    });
  }

  async dismiss(shopId: string, id: string, dismissedBy: string) {
    const existing = await this.prisma.reminder.findFirst({ where: { id, shopId } });
    if (!existing) return null;
    return this.prisma.reminder.update({
      where: { id },
      data: { status: 'DISMISSED', dismissedAt: new Date(), dismissedBy },
    });
  }
}
