import { decimalToNumber } from '@database/prisma/decimal-mapping';
import {
  activeOccupyingAllocationWhere,
  unreleasedRentalWhere,
} from '@database/prisma/inventory-availability';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import type { DashboardRepository } from '../domain/dashboard.repository';

@Injectable()
export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getShopTimezone(shopId: string): Promise<string> {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { timezone: true },
    });
    return shop?.timezone ?? 'Asia/Ho_Chi_Minh';
  }

  async summary(input: {
    shopId: string;
    now: Date;
    dayStart: Date;
    dayEnd: Date;
    monthStart: Date;
    monthEnd: Date;
  }) {
    const revenuePurposes = [
      'RENTAL_PAYMENT',
      'LATE_FEE',
      'DAMAGE_FEE',
      'SHIPPING',
      'ORDER_REFUND',
      'OTHER',
    ];
    const paymentWhere = {
      shopId: input.shopId,
      status: 'COMPLETED',
      voidedAt: null,
      purpose: { in: revenuePurposes },
    };
    const inventorySummary = this.prisma.inventoryItem.groupBy({
      by: ['currentStatus'],
      where: { shopId: input.shopId, archivedAt: null },
      _count: { _all: true },
    });
    const [
      todayIn,
      todayOut,
      monthIn,
      monthOut,
      ordersToday,
      currentlyRented,
      dueToday,
      overdue,
      pendingReminders,
      inventoryGrouped,
      bookedAvailableInventory,
      rentedAvailableInventory,
      upcoming,
    ] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.aggregate({
        where: {
          ...paymentWhere,
          direction: 'IN',
          paidAt: { gte: input.dayStart, lt: input.dayEnd },
        },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: {
          ...paymentWhere,
          direction: 'OUT',
          paidAt: { gte: input.dayStart, lt: input.dayEnd },
        },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: {
          ...paymentWhere,
          direction: 'IN',
          paidAt: { gte: input.monthStart, lt: input.monthEnd },
        },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: {
          ...paymentWhere,
          direction: 'OUT',
          paidAt: { gte: input.monthStart, lt: input.monthEnd },
        },
        _sum: { amount: true },
      }),
      this.prisma.rentalOrder.count({
        where: { shopId: input.shopId, createdAt: { gte: input.dayStart, lt: input.dayEnd } },
      }),
      this.prisma.rentalItemAllocation.count({
        where: { shopId: input.shopId, status: 'ACTIVE', releasedAt: null },
      }),
      this.prisma.rentalOrder.count({
        where: {
          shopId: input.shopId,
          status: { in: ['CONFIRMED', 'ACTIVE'] },
          rentalEndAt: { gte: input.dayStart, lt: input.dayEnd },
        },
      }),
      this.prisma.rentalOrder.count({
        where: {
          shopId: input.shopId,
          status: { in: ['CONFIRMED', 'ACTIVE'] },
          rentalEndAt: { lt: input.now },
        },
      }),
      this.prisma.reminder.count({ where: { shopId: input.shopId, status: 'PENDING' } }),
      inventorySummary,
      this.prisma.inventoryItem.count({
        where: {
          shopId: input.shopId,
          archivedAt: null,
          currentStatus: 'AVAILABLE',
          allocations: {
            some: {
              ...activeOccupyingAllocationWhere(),
            },
            none: unreleasedRentalWhere(),
          },
        },
      }),
      this.prisma.inventoryItem.count({
        where: {
          shopId: input.shopId,
          archivedAt: null,
          currentStatus: 'AVAILABLE',
          allocations: { some: unreleasedRentalWhere() },
        },
      }),
      this.prisma.rentalOrder.findMany({
        where: {
          shopId: input.shopId,
          status: { in: ['RESERVED', 'CONFIRMED', 'ACTIVE'] },
          rentalStartAt: { gte: input.now, lt: new Date(input.now.getTime() + 7 * 86_400_000) },
        },
        include: {
          customer: { select: { fullName: true, phone: true } },
          items: {
            select: { productNameSnapshot: true, variantNameSnapshot: true, quantity: true },
          },
        },
        orderBy: { rentalStartAt: 'asc' },
        take: 10,
      }),
    ]);

    return {
      revenue: {
        today:
          decimalToNumber(todayIn._sum.amount ?? 0) - decimalToNumber(todayOut._sum.amount ?? 0),
        month:
          decimalToNumber(monthIn._sum.amount ?? 0) - decimalToNumber(monthOut._sum.amount ?? 0),
      },
      ordersToday,
      currentlyRented,
      dueToday,
      overdue,
      pendingReminders,
      inventory: (() => {
        const counts = Object.fromEntries(
          inventoryGrouped.map((row) => [row.currentStatus, row._count._all]),
        );
        counts.AVAILABLE = Math.max(
          0,
          (counts.AVAILABLE ?? 0) - bookedAvailableInventory - rentedAvailableInventory,
        );
        counts.RESERVED = (counts.RESERVED ?? 0) + bookedAvailableInventory;
        counts.RENTED = rentedAvailableInventory;
        counts.TOTAL = inventoryGrouped.reduce((sum, row) => sum + row._count._all, 0);
        return counts;
      })(),
      upcoming,
    };
  }
}
