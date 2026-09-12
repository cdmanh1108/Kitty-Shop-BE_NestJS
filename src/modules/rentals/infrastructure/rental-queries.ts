import { TRANSACTION_STATUS } from '@modules/finance/domain/payment-status';
import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import { type Prisma, type PrismaClient } from '@prisma/client';

import { type RentalRepository } from '../domain/rental.repository';

export async function customerExists(
  prisma: PrismaService,
  shopId: string,
  customerId: string,
): ReturnType<RentalRepository['customerExists']> {
  return (
    (await prisma.customer.count({
      where: { id: customerId, shopId, status: 'ACTIVE', archivedAt: null },
    })) > 0
  );
}
export async function locationExists(
  prisma: PrismaService,
  shopId: string,
  locationId: string,
): ReturnType<RentalRepository['locationExists']> {
  return (
    (await prisma.shopLocation.count({
      where: { id: locationId, shopId, isActive: true },
    })) > 0
  );
}
export async function list(
  prisma: PrismaService,
  input: Parameters<RentalRepository['list']>[0],
): ReturnType<RentalRepository['list']> {
  const phoneSearch = input.search?.replace(/\D/g, '');
  const where = {
    shopId: input.shopId,
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
    ...(input.from || input.until
      ? {
          rentalStartAt: input.until ? { lt: input.until } : undefined,
          rentalEndAt: input.from ? { gt: input.from } : undefined,
        }
      : {}),
    ...(input.search
      ? {
          OR: [
            { orderNumber: { contains: input.search, mode: 'insensitive' as const } },
            { customer: { fullName: { contains: input.search, mode: 'insensitive' as const } } },
            ...(phoneSearch ? [{ customer: { normalizedPhone: { contains: phoneSearch } } }] : []),
          ],
        }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.rentalOrder.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        rentalStartAt: true,
        rentalEndAt: true,
        status: true,
        paymentStatus: true,
        depositStatus: true,
        grandTotal: true,
        customer: { select: { id: true, fullName: true, phone: true } },
        items: {
          select: {
            id: true,
            productNameSnapshot: true,
            variantNameSnapshot: true,
            quantity: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.rentalOrder.count({ where }),
  ]);
  return { items, meta: paginateMeta(input.page, input.limit, total) };
}
export function get(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<RentalRepository['get']> {
  return getWithTx(prisma, shopId, id);
}
export async function getStatus(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<RentalRepository['getStatus']> {
  const order = await prisma.rentalOrder.findFirst({
    where: { id, shopId },
    select: { status: true },
  });
  return order?.status ?? null;
}
export function getSchedule(
  prisma: PrismaService,
  shopId: string,
  id: string,
): ReturnType<RentalRepository['getSchedule']> {
  return prisma.rentalOrder.findFirst({
    where: { id, shopId },
    select: { status: true, rentalStartAt: true, rentalEndAt: true },
  });
}
export function getWithTx(
  tx: Prisma.TransactionClient | PrismaClient,
  shopId: string,
  id: string,
): ReturnType<RentalRepository['get']> {
  return tx.rentalOrder.findFirst({
    where: { id, shopId },
    include: {
      customer: true,
      location: true,
      items: { include: { allocations: { include: { inventoryItem: true } } } },
      charges: { where: { voidedAt: null }, orderBy: { createdAt: 'asc' } },
      payments: {
        where: { status: TRANSACTION_STATUS.COMPLETED, voidedAt: null },
        orderBy: { paidAt: 'asc' },
      },
      deliveries: { orderBy: { createdAt: 'asc' } },
      statusHistory: { orderBy: { changedAt: 'asc' } },
    },
  });
}
