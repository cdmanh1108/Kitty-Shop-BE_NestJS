import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { TRANSACTION_STATUS } from '@modules/finance/domain/payment-status';
import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import { type Prisma, type PrismaClient } from '@prisma/client';
import { storefrontProductEligibility } from '@modules/catalog/domain/storefront-eligibility';

import {
  type RentalRepository,
  type StorefrontOrderLookupRecord,
} from '../domain/rental.repository';
import { calculateRentalPaymentTotals } from '../domain/rental-settlement';

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
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.rentalOrder.count({ where }),
  ]);
  const counts = items.length
    ? await prisma.rentalOrderItem.groupBy({
        by: ['orderId'],
        where: { shopId: input.shopId, orderId: { in: items.map((item) => item.id) } },
        orderBy: { orderId: 'asc' },
        _sum: { quantity: true },
        _count: { _all: true },
      })
    : [];
  const countByOrder = new Map(
    counts.map((row) => [
      row.orderId,
      { itemCount: row._sum.quantity ?? 0, productCount: row._count._all },
    ]),
  );
  return {
    items: items.map((item) => ({
      ...item,
      itemCount: countByOrder.get(item.id)?.itemCount ?? 0,
      productCount: countByOrder.get(item.id)?.productCount ?? 0,
    })),
    meta: paginateMeta(input.page, input.limit, total),
  };
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
      confirmation: true,
      returnRecord: { include: { inspections: true } },
      settlement: true,
      customer: true,
      location: true,
      items: {
        include: {
          allocations: { include: { inventoryItem: true } },
          variant: {
            include: {
              media: {
                where: { mediaType: 'IMAGE' },
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
            },
          },
          product: {
            include: {
              media: {
                where: { mediaType: 'IMAGE' },
                orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                take: 1,
              },
            },
          },
        },
      },
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

export async function findActiveVariantIdsByProduct(
  prisma: PrismaService,
  shopId: string,
  productId: string,
  storefrontEligibility = false,
): Promise<string[]> {
  const variants = await prisma.productVariant.findMany({
    where: {
      productId,
      shopId,
      status: 'ACTIVE',
      archivedAt: null,
      ...(storefrontEligibility ? { product: storefrontProductEligibility } : {}),
    },
    select: { id: true },
  });
  return variants.map((v) => v.id);
}

export async function lookupStorefrontOrder(
  prisma: PrismaService,
  shopId: string,
  orderNumber: string,
): Promise<StorefrontOrderLookupRecord | null> {
  const order = await prisma.rentalOrder.findFirst({
    where: {
      shopId,
      orderNumber: orderNumber.trim(),
    },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            include: {
              media: {
                where: { isPrimary: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  // Keep the public projection on the same ledger semantics as the admin
  // presenter.  The shared calculator deliberately excludes collateral
  // movements and signs all other completed payment directions.
  const payments = await prisma.paymentTransaction.findMany({
    where: {
      shopId,
      orderId: order.id,
      status: TRANSACTION_STATUS.COMPLETED,
      voidedAt: null,
    },
    select: { amount: true, direction: true, purpose: true },
  });

  const paymentTotals = calculateRentalPaymentTotals({
    grandTotal: order.grandTotal.toString(),
    payments: payments.map((payment) => ({
      amount: payment.amount.toString(),
      direction: payment.direction,
      purpose: payment.purpose,
    })),
  });
  const paidAmount = Number(paymentTotals.paidAmount);

  return {
    orderNumber: order.orderNumber,
    customerFullName: order.customer.fullName,
    customerPhone: order.customer.phone,
    customerNormalizedPhone: order.customer.normalizedPhone,
    rentalStartAt: order.rentalStartAt,
    rentalEndAt: order.rentalEndAt,
    status: order.status.toLowerCase(),
    grandTotal: decimalToNumber(order.grandTotal),
    depositRequired: decimalToNumber(order.depositRequired),
    paidAmount,
    items: order.items.map((item) => ({
      name: item.productNameSnapshot,
      imageUrl: item.product?.media?.[0]?.url ?? '',
      quantity: item.quantity,
    })),
  };
}
