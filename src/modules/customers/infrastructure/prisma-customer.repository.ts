import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { paginateMeta } from '@common/types/pagination';
import { PrismaService } from '@database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { CustomerRepository } from '../domain/customer.repository';

@Injectable()
export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: Parameters<CustomerRepository['list']>[0]) {
    const phoneSearch = input.search?.replace(/\D/g, '');
    const where = {
      shopId: input.shopId,
      archivedAt: null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.customerType ? { customerType: input.customerType } : {}),
      ...(input.search
        ? {
            OR: [
              { fullName: { contains: input.search, mode: 'insensitive' as const } },
              ...(phoneSearch ? [{ normalizedPhone: { contains: phoneSearch } }] : []),
              { customerCode: { contains: input.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, meta: paginateMeta(input.page, input.limit, total) };
  }

  async findById(shopId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, shopId, archivedAt: null },
      include: {
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        notes: { orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }] },
        tags: { include: { tag: true } },
      },
    });
    if (!customer) return null;

    const [totalOrders, completedOrders, payments, recentOrders] = await this.prisma.$transaction([
      this.prisma.rentalOrder.count({ where: { shopId, customerId: id } }),
      this.prisma.rentalOrder.count({ where: { shopId, customerId: id, status: 'COMPLETED' } }),
      this.prisma.paymentTransaction.findMany({
        where: { shopId, customerId: id, status: 'COMPLETED', voidedAt: null },
        select: { amount: true, direction: true, purpose: true },
      }),
      this.prisma.rentalOrder.findMany({
        where: { shopId, customerId: id },
        select: {
          id: true,
          orderNumber: true,
          rentalStartAt: true,
          rentalEndAt: true,
          status: true,
          paymentStatus: true,
          grandTotal: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const netNonDepositPaid = payments.reduce((sum, payment) => {
      if (['DEPOSIT', 'DEPOSIT_REFUND'].includes(payment.purpose)) return sum;
      return (
        sum +
        (payment.direction === 'IN'
          ? decimalToNumber(payment.amount)
          : -decimalToNumber(payment.amount))
      );
    }, 0);
    const depositHeld = payments.reduce((sum, payment) => {
      if (!['DEPOSIT', 'DEPOSIT_REFUND'].includes(payment.purpose)) return sum;
      return (
        sum +
        (payment.direction === 'IN'
          ? decimalToNumber(payment.amount)
          : -decimalToNumber(payment.amount))
      );
    }, 0);

    return {
      ...customer,
      tags: customer.tags.map((item) => item.tag),
      stats: { totalOrders, completedOrders, totalPaid: netNonDepositPaid, depositHeld },
      recentOrders,
    };
  }

  create(shopId: string, input: Parameters<CustomerRepository['create']>[1]) {
    return this.prisma.customer.create({ data: { shopId, ...input } });
  }

  async update(shopId: string, id: string, input: Parameters<CustomerRepository['update']>[2]) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, shopId, archivedAt: null },
    });
    if (!existing) return null;
    return this.prisma.customer.update({ where: { id }, data: input });
  }

  addNote(input: Parameters<CustomerRepository['addNote']>[0]) {
    return this.prisma.customerNote.create({
      data: {
        customerId: input.customerId,
        content: input.content,
        isPinned: input.isPinned,
        createdBy: input.createdBy,
      },
    });
  }
  async addAddress(input: Parameters<CustomerRepository['addAddress']>[0]) {
    const customer = await this.prisma.customer.count({
      where: { id: input.customerId, shopId: input.shopId, archivedAt: null },
    });
    if (!customer) return null;
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: input.customerId },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.create({
        data: {
          customerId: input.customerId,
          label: input.label,
          recipientName: input.recipientName,
          phone: input.phone,
          addressLine: input.addressLine,
          ward: input.ward,
          district: input.district,
          city: input.city,
          province: input.province,
          isDefault: input.isDefault,
        },
      });
    });
  }

  async updateAddress(input: Parameters<CustomerRepository['updateAddress']>[0]) {
    const address = await this.prisma.customerAddress.findFirst({
      where: {
        id: input.addressId,
        customerId: input.customerId,
        customer: { shopId: input.shopId, archivedAt: null },
      },
      select: { id: true },
    });
    if (!address) return null;
    return this.prisma.$transaction(async (tx) => {
      if (input.data.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId: input.customerId },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.update({ where: { id: input.addressId }, data: input.data });
    });
  }

  async deleteAddress(shopId: string, customerId: string, addressId: string): Promise<boolean> {
    const deleted = await this.prisma.customerAddress.deleteMany({
      where: { id: addressId, customerId, customer: { shopId, archivedAt: null } },
    });
    return deleted.count === 1;
  }
}
