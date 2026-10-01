import { decimalToNumber } from '@database/prisma/decimal-mapping';
import { TRANSACTION_STATUS } from '@modules/finance/domain/payment-status';
import { paginateMeta } from '@common/types/pagination';
import type { PrismaService } from '@database/prisma/prisma.service';
import type { StorefrontOrderLookupRecord } from '../domain/ports/rental-order-reader.port';
import type {
  WebAccountRentalOrderDetail,
  WebAccountRentalOrderListCriteria,
} from '../domain/ports/web-account-rental-orders.reader';
import type { RentalStatus } from '../domain/rental-status';
import { RENTAL_ORDER_SOURCE } from '../domain/rental-order-source';
import { calculateRentalPaymentTotals } from '../domain/rental-settlement';

export async function lookupStorefrontOrder(
  prisma: PrismaService,
  shopId: string,
  orderNumber: string,
): Promise<StorefrontOrderLookupRecord | null> {
  const order = await prisma.rentalOrder.findFirst({
    where: {
      shopId,
      orderNumber: orderNumber.trim(),
      source: RENTAL_ORDER_SOURCE.ONLINE,
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

const accountOrderWhere = (shopId: string, webAccountId: string, status?: RentalStatus) => ({
  shopId,
  webAccountId,
  source: 'ONLINE' as const,
  ...(status ? { status } : {}),
});

export async function listWebAccountOrders(
  prisma: PrismaService,
  input: WebAccountRentalOrderListCriteria,
) {
  const where = accountOrderWhere(input.shopId, input.webAccountId, input.status);
  const [orders, total] = await prisma.$transaction([
    prisma.rentalOrder.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        rentalStartAt: true,
        rentalEndAt: true,
        status: true,
        paymentStatus: true,
        depositStatus: true,
        grandTotal: true,
        depositRequired: true,
        preferredPaymentMethod: true,
        items: {
          select: { productNameSnapshot: true, variantNameSnapshot: true, quantity: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 3,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.rentalOrder.count({ where }),
  ]);
  const itemCounts = orders.length
    ? await prisma.rentalOrderItem.groupBy({
        by: ['orderId'],
        where: { orderId: { in: orders.map((order) => order.id) } },
        _sum: { quantity: true },
      })
    : [];
  const itemCountByOrder = new Map(
    itemCounts.map((itemCount) => [itemCount.orderId, itemCount._sum.quantity ?? 0]),
  );
  return {
    items: orders.map((order) => ({
      orderCode: order.orderNumber,
      createdAt: order.createdAt,
      rentalStartAt: order.rentalStartAt,
      rentalEndAt: order.rentalEndAt,
      status: order.status,
      paymentStatus: order.paymentStatus,
      depositStatus: order.depositStatus,
      grandTotal: decimalToNumber(order.grandTotal),
      depositRequired: decimalToNumber(order.depositRequired),
      preferredPaymentMethod: order.preferredPaymentMethod,
      itemCount: itemCountByOrder.get(order.id) ?? 0,
      itemsPreview: order.items.map((item) => ({
        productName: item.productNameSnapshot,
        variantName: item.variantNameSnapshot,
        quantity: item.quantity,
      })),
    })),
    meta: paginateMeta(input.page, input.limit, total),
  };
}

export async function getWebAccountOrder(
  prisma: PrismaService,
  shopId: string,
  webAccountId: string,
  orderNumber: string,
): Promise<WebAccountRentalOrderDetail | null> {
  const order = await prisma.rentalOrder.findFirst({
    where: { ...accountOrderWhere(shopId, webAccountId), orderNumber: orderNumber.trim() },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      rentalStartAt: true,
      rentalEndAt: true,
      actualReturnedAt: true,
      status: true,
      paymentStatus: true,
      depositStatus: true,
      grandTotal: true,
      depositRequired: true,
      preferredPaymentMethod: true,
      rentalSubtotal: true,
      chargesTotal: true,
      discountTotal: true,
      collateralMethod: true,
      documentType: true,
      items: {
        select: {
          productId: true,
          productNameSnapshot: true,
          variantNameSnapshot: true,
          quantity: true,
          unitRentalPrice: true,
          lineTotal: true,
          depositAmount: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
      deliveries: {
        select: {
          method: true,
          status: true,
          scheduledAt: true,
          recipientName: true,
          recipientPhone: true,
          addressLine: true,
          shippingFee: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
      statusHistory: {
        select: { toStatus: true, changedAt: true },
        orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!order) return null;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    id: order.id,
    orderCode: order.orderNumber,
    createdAt: order.createdAt,
    rentalStartAt: order.rentalStartAt,
    rentalEndAt: order.rentalEndAt,
    actualReturnedAt: order.actualReturnedAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    depositStatus: order.depositStatus,
    grandTotal: decimalToNumber(order.grandTotal),
    depositRequired: decimalToNumber(order.depositRequired),
    preferredPaymentMethod: order.preferredPaymentMethod,
    itemCount,
    itemsPreview: order.items.slice(0, 3).map((item) => ({
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      quantity: item.quantity,
    })),
    rentalSubtotal: decimalToNumber(order.rentalSubtotal),
    chargesTotal: decimalToNumber(order.chargesTotal),
    discountTotal: decimalToNumber(order.discountTotal),
    collateralMethod: order.collateralMethod,
    documentType: order.documentType,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productNameSnapshot,
      variantName: item.variantNameSnapshot,
      quantity: item.quantity,
      unitRentalPrice: decimalToNumber(item.unitRentalPrice),
      lineTotal: decimalToNumber(item.lineTotal),
      depositAmount: decimalToNumber(item.depositAmount),
    })),
    deliveries: order.deliveries.map((delivery) => ({
      ...delivery,
      shippingFee: decimalToNumber(delivery.shippingFee),
    })),
    timeline: order.statusHistory.map((entry) => ({
      status: entry.toStatus,
      changedAt: entry.changedAt,
    })),
  };
}
