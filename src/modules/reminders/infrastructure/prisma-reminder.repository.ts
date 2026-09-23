import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { DEPOSIT_STATUS, ORDER_PAYMENT_STATUS } from '@modules/finance/domain/payment-status';
import { RENTAL_STATUS } from '@modules/rentals/domain/rental-status';
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

  list(shopId: string, status?: string) {
    return this.prisma.reminder.findMany({
      where: { shopId, ...(status ? { status } : {}) },
      include: {
        customer: { select: { fullName: true, phone: true } },
        order: { select: { orderNumber: true, status: true } },
      },
      orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }],
      take: 500,
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
