import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
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

  async candidates(shopId: string) {
    const orders = await this.prisma.rentalOrder.findMany({
      where: { shopId, status: { in: ['RESERVED', 'CONFIRMED', 'ACTIVE', 'COMPLETED'] } },
      include: { customer: { select: { fullName: true, phone: true } } },
      orderBy: { rentalStartAt: 'asc' },
    });
    return orders.map((order) => ({
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
        status: 'PENDING',
        dismissedAt: null,
        dismissedBy: null,
      },
    });
  }

  async resolveMissing(shopId: string, activeKeys: string[]): Promise<void> {
    await this.prisma.reminder.updateMany({
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
