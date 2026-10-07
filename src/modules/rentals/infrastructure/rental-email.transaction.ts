import type { Prisma } from '@prisma/client';
import { listCompletedPaymentLines } from '@modules/finance/public/completed-payment-reader';
import { calculateRentalPaymentTotals } from '../domain/rental-settlement';
import { RENTAL_ORDER_SOURCE } from '../domain/rental-order-source';
import type { RentalEmailEvent, RentalEmailSnapshot } from '../domain/rental-email';
import { rentalLedger } from './rental-ledger';

const sequence: Record<RentalEmailEvent, number> = {
  CONFIRMED: 2,
  COMPLETED: 4,
};

/** One email consumer record per event, committed atomically with the existing outbox. */
export async function enqueueRentalEmail(
  tx: Prisma.TransactionClient,
  input: {
    shopId: string;
    orderId: string;
    eventId: string;
    event: RentalEmailEvent;
  },
): Promise<void> {
  const order = await tx.rentalOrder.findFirst({
    where: {
      id: input.orderId,
      shopId: input.shopId,
      source: RENTAL_ORDER_SOURCE.ONLINE,
      notificationEmail: { not: null },
    },
    include: {
      shop: { select: { name: true, phone: true, email: true, timezone: true } },
      customer: { select: { fullName: true } },
      items: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          productNameSnapshot: true,
          variantNameSnapshot: true,
          quantity: true,
          billingRole: true,
        },
      },
      settlement: { select: { refundAmount: true, amountDue: true } },
      deliveries: {
        where: { direction: 'OUTBOUND' },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { method: true, addressLine: true },
      },
    },
  });
  if (!order?.notificationEmail) return;
  const payments = await listCompletedPaymentLines(tx, order.id);
  const totals = calculateRentalPaymentTotals({
    grandTotal: order.grandTotal.toString(),
    payments,
  });
  const ledger = rentalLedger(payments);
  const money = (value: { toString(): string } | string): string =>
    new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: order.currency,
      maximumFractionDigits: 2,
    }).format(Number(value.toString()));
  const date = (value: Date): string =>
    new Intl.DateTimeFormat('vi-VN', {
      timeZone: order.shop.timezone,
      dateStyle: 'short',
      timeStyle: 'short',
      hour12: false,
    }).format(value);
  const details = [
    { label: 'Ngày nhận đồ', value: date(order.rentalStartAt) },
    { label: 'Ngày trả đồ', value: date(order.rentalEndAt) },
    { label: 'Múi giờ', value: order.shop.timezone },
    { label: 'Tiền thuê', value: money(order.rentalSubtotal) },
    { label: 'Phí phát sinh / giao nhận', value: money(order.chargesTotal) },
    { label: 'Giảm giá', value: money(order.discountTotal) },
    { label: 'Tổng tiền đơn (không gồm cọc)', value: money(order.grandTotal) },
    { label: 'Đã thanh toán cho đơn', value: money(totals.paidAmount) },
    { label: 'Tiền đơn còn phải thanh toán', value: money(totals.remainingAmount) },
  ];
  if (order.collateralMethod === 'DOCUMENT') {
    details.push({
      label: 'Giấy tờ đặt cọc',
      value: `${order.documentType === 'CCCD' ? 'Căn cước công dân' : order.documentType === 'GPLX' ? 'Giấy phép lái xe' : 'Giấy tờ'} · ${order.collateralStatus === 'RETURNED' ? 'Đã trả lại' : order.collateralStatus === 'HELD' ? 'Cửa hàng đang giữ' : 'Chưa nhận'}`,
    });
  } else {
    details.push(
      { label: 'Cọc dự kiến khi đặt đơn', value: money(order.depositRequired) },
      { label: 'Tổng cọc đã nhận', value: money(ledger.depositIn) },
      { label: 'Cọc còn giữ', value: money(ledger.depositHeld) },
    );
  }
  const delivery = order.deliveries[0];
  if (delivery) {
    details.push({
      label: 'Cách nhận đồ',
      value: delivery.method === 'DELIVERY' ? 'Cửa hàng giao đồ' : 'Nhận tại cửa hàng',
    });
    if (delivery.method === 'DELIVERY' && delivery.addressLine)
      details.push({ label: 'Địa chỉ giao đồ', value: delivery.addressLine });
  }
  if (input.event === 'COMPLETED' && order.settlement) {
    details.push(
      { label: 'Đã thu thêm khi tất toán', value: money(order.settlement.amountDue) },
      { label: 'Đã hoàn lại khi tất toán', value: money(order.settlement.refundAmount) },
    );
  }
  const snapshot: RentalEmailSnapshot = {
    version: 1,
    event: input.event,
    orderCode: order.orderNumber,
    accountOwned: Boolean(order.webAccountId),
    customerName: order.customer.fullName,
    shopName: order.shop.name,
    contactPhone: order.shop.phone ?? '',
    contactEmail: order.shop.email ?? '',
    details,
    items: order.items.map((item) => ({
      name: item.productNameSnapshot,
      variant: item.variantNameSnapshot ?? '',
      quantity: item.quantity,
      free: item.billingRole === 'FREE_ACCESSORY',
    })),
  };
  await tx.notificationLog.create({
    data: {
      shopId: input.shopId,
      orderId: order.id,
      customerId: order.customerId,
      eventId: input.eventId,
      eventSequence: sequence[input.event],
      channel: 'EMAIL',
      recipient: order.notificationEmail,
      templateCode: `RENTAL_WEB_${input.event}`,
      payload: {
        ...snapshot,
        details: snapshot.details.map((row) => ({ ...row })),
        items: snapshot.items.map((row) => ({ ...row })),
      },
      content: '',
      status: 'PENDING',
      provider: 'RESEND',
    },
  });
}
