import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { paginateMeta } from '@common/types/pagination';
import { PrismaService } from '@database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  BookingCustomerUnavailableError,
  CustomerPhoneAlreadyExistsError,
} from '../domain/customer-errors';
import { normalizeCustomerPhone, normalizeCustomerPhoneSearch } from '../domain/customer-phone';
import type { CustomerRepository } from '../domain/customer.repository';

@Injectable()
export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: Parameters<CustomerRepository['list']>[0]) {
    const phoneSearch = input.search ? normalizeCustomerPhoneSearch(input.search) : undefined;
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
    const [customers, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: {
          id: true,
          customerCode: true,
          fullName: true,
          phone: true,
          facebook: true,
          zalo: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    const customerIds = customers.map(({ id }) => id);
    if (!customerIds.length)
      return { items: [], meta: paginateMeta(input.page, input.limit, total) };

    const rentals = await this.prisma.rentalOrder.groupBy({
      by: ['customerId'],
      where: { shopId: input.shopId, customerId: { in: customerIds }, status: 'COMPLETED' },
      orderBy: { customerId: 'asc' },
      _count: { customerId: true },
      _max: { rentalStartAt: true },
    });
    const payments = await this.prisma.paymentTransaction.groupBy({
      by: ['customerId', 'direction'],
      where: {
        shopId: input.shopId,
        customerId: { in: customerIds },
        status: 'COMPLETED',
        voidedAt: null,
        purpose: { notIn: ['DEPOSIT', 'DEPOSIT_REFUND'] },
      },
      orderBy: [{ customerId: 'asc' }, { direction: 'asc' }],
      _sum: { amount: true },
    });
    const rentalByCustomer = new Map(rentals.map((row) => [row.customerId, row]));
    const paidByCustomer = new Map<string, number>();
    for (const payment of payments) {
      const signedAmount =
        (payment.direction === 'IN' ? 1 : -1) * decimalToNumber(payment._sum?.amount ?? 0);
      paidByCustomer.set(
        payment.customerId,
        (paidByCustomer.get(payment.customerId) ?? 0) + signedAmount,
      );
    }
    const items = customers.map((customer) => ({
      ...customer,
      completedRentalCount: rentalByCustomer.get(customer.id)?._count?.customerId ?? 0,
      lastRentalAt: rentalByCustomer.get(customer.id)?._max?.rentalStartAt ?? null,
      totalPaid: paidByCustomer.get(customer.id) ?? 0,
    }));
    return { items, meta: paginateMeta(input.page, input.limit, total) };
  }

  async lookup(input: Parameters<CustomerRepository['lookup']>[0]) {
    const phoneSearch = input.search ? normalizeCustomerPhoneSearch(input.search) : undefined;
    return this.prisma.customer.findMany({
      where: {
        shopId: input.shopId,
        archivedAt: null,
        status: 'ACTIVE',
        ...(input.search
          ? {
              OR: [
                { fullName: { contains: input.search, mode: 'insensitive' as const } },
                ...(phoneSearch ? [{ normalizedPhone: { contains: phoneSearch } }] : []),
              ],
            }
          : {}),
      },
      select: { id: true, fullName: true, phone: true },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: input.limit,
    });
  }

  findByNormalizedPhone(shopId: string, normalizedPhone: string) {
    return this.prisma.customer.findFirst({
      where: { shopId, normalizedPhone, archivedAt: null },
      select: { id: true, fullName: true, phone: true },
    });
  }

  async resolveForBooking(input: Parameters<CustomerRepository['resolveForBooking']>[0]) {
    const normalizedPhone = normalizeCustomerPhone(input.phone);
    const existing = await this.findBookingCustomer(input.shopId, normalizedPhone);
    if (existing) return this.assertBookingCustomerEligible(existing);

    try {
      return await this.prisma.customer.create({
        data: {
          shopId: input.shopId,
          customerCode: `CUS-WEB-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          normalizedPhone,
          email: input.email?.trim().toLowerCase() || null,
          facebook: input.facebook?.trim() || null,
          zalo: null,
          birthday: null,
          gender: null,
          customerType: 'NORMAL',
          status: 'ACTIVE',
          source: 'WEB',
        },
        select: { id: true },
      });
    } catch (error) {
      if (!this.isNormalizedPhoneConflict(error)) throw error;
      const winner = await this.findBookingCustomer(input.shopId, normalizedPhone);
      if (!winner) throw error;
      return this.assertBookingCustomerEligible(winner);
    }
  }

  private findBookingCustomer(shopId: string, normalizedPhone: string) {
    return this.prisma.customer.findFirst({
      where: { shopId, normalizedPhone },
      select: { id: true, status: true, archivedAt: true },
    });
  }

  private assertBookingCustomerEligible(customer: {
    id: string;
    status: string;
    archivedAt: Date | null;
  }): { id: string } {
    if (customer.archivedAt !== null || customer.status !== 'ACTIVE') {
      throw new BookingCustomerUnavailableError();
    }
    return { id: customer.id };
  }

  private isNormalizedPhoneConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
      return false;
    const fields = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    return (
      fields.length === 2 &&
      fields.some((field) => field === 'shop_id' || field === 'shopId') &&
      fields.some((field) => field === 'normalized_phone' || field === 'normalizedPhone')
    );
  }

  async findById(shopId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, shopId, archivedAt: null },
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        phone: true,
        facebook: true,
        zalo: true,
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, addressLine: true, isDefault: true },
        },
        notes: {
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, content: true, createdAt: true },
        },
      },
    });
    if (!customer) return null;

    const [completedRentalCount, lastRental, payments] = await this.prisma.$transaction([
      this.prisma.rentalOrder.count({ where: { shopId, customerId: id, status: 'COMPLETED' } }),
      this.prisma.rentalOrder.findFirst({
        where: { shopId, customerId: id, status: 'COMPLETED' },
        select: { rentalStartAt: true },
        orderBy: { rentalStartAt: 'desc' },
      }),
      this.prisma.paymentTransaction.groupBy({
        by: ['direction', 'purpose'],
        where: { shopId, customerId: id, status: 'COMPLETED', voidedAt: null },
        orderBy: [{ direction: 'asc' }, { purpose: 'asc' }],
        _sum: { amount: true },
      }),
    ]);

    const netNonDepositPaid = payments.reduce((sum, payment) => {
      if (['DEPOSIT', 'DEPOSIT_REFUND'].includes(payment.purpose)) return sum;
      return (
        sum +
        (payment.direction === 'IN'
          ? decimalToNumber(payment._sum?.amount ?? 0)
          : -decimalToNumber(payment._sum?.amount ?? 0))
      );
    }, 0);
    const depositHeld = payments.reduce((sum, payment) => {
      if (!['DEPOSIT', 'DEPOSIT_REFUND'].includes(payment.purpose)) return sum;
      return (
        sum +
        (payment.direction === 'IN'
          ? decimalToNumber(payment._sum?.amount ?? 0)
          : -decimalToNumber(payment._sum?.amount ?? 0))
      );
    }, 0);

    return {
      ...customer,
      stats: {
        completedRentalCount,
        totalPaid: netNonDepositPaid,
        depositHeld,
        lastRentalAt: lastRental?.rentalStartAt ?? null,
      },
    };
  }

  async create(shopId: string, input: Parameters<CustomerRepository['create']>[1]) {
    try {
      const { initialNote, ...customerData } = input;
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({ data: { shopId, ...customerData } });
        if (initialNote) {
          await tx.customerNote.create({
            data: {
              customerId: customer.id,
              content: initialNote.content,
              createdBy: initialNote.createdBy,
            },
          });
        }
        return customer;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CustomerPhoneAlreadyExistsError();
      }
      throw error;
    }
  }

  async update(shopId: string, id: string, input: Parameters<CustomerRepository['update']>[2]) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, shopId, archivedAt: null },
    });
    if (!existing) return null;
    try {
      return await this.prisma.customer.update({ where: { id }, data: input });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CustomerPhoneAlreadyExistsError();
      }
      throw error;
    }
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
