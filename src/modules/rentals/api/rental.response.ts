import type { JsonSerialized } from '@common/types/json';
import { Prisma } from '@prisma/client';
import { calculateRentalSettlement } from '../domain/rental-settlement';
import type { RentalOrderDetails, RentalOrderPage } from '../domain/rental.models';
import type { RentalOrderListItemResDto, RentalOrderResDto } from './rental.dto';

function timestamp(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

type Summary = RentalOrderPage['items'][number] | NonNullable<RentalOrderDetails>;

export function toRentalSummary(row: Summary | JsonSerialized<Summary>): RentalOrderListItemResDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    rentalStartAt: timestamp(row.rentalStartAt),
    rentalEndAt: timestamp(row.rentalEndAt),
    status: row.status,
    paymentStatus: row.paymentStatus,
    depositStatus: row.depositStatus,
    grandTotal: row.grandTotal.toString(),
    itemCount: 'itemCount' in row ? row.itemCount : row.items.reduce((sum, item) => sum + item.quantity, 0),
    productCount: 'productCount' in row ? row.productCount : row.items.length,
    customer: { id: row.customer.id, fullName: row.customer.fullName, phone: row.customer.phone },
  };
}

/** An explicit allowlist also applies to replayed idempotency responses. */
export function toRentalResponse(
  row: RentalOrderDetails | JsonSerialized<RentalOrderDetails>,
): RentalOrderResDto | null {
  if (!row) return null;
  let paidAmount = new Prisma.Decimal(0);
  let depositIn = new Prisma.Decimal(0);
  let depositOut = new Prisma.Decimal(0);
  for (const payment of row.payments) {
    const amount = new Prisma.Decimal(payment.amount.toString());
    if (payment.purpose === 'DEPOSIT' || payment.purpose === 'DEPOSIT_REFUND') {
      if (payment.direction === 'IN') depositIn = depositIn.plus(amount);
      else depositOut = depositOut.plus(amount);
    } else {
      paidAmount = payment.direction === 'IN' ? paidAmount.plus(amount) : paidAmount.minus(amount);
    }
  }
  const remainingAmount = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    new Prisma.Decimal(row.grandTotal.toString()).minus(paidAmount),
  );
  const settlement = calculateRentalSettlement({
    completed: row.status === 'COMPLETED',
    grandTotal: row.grandTotal.toString(),
    paidRental: paidAmount.toString(),
    depositIn: depositIn.toString(),
    depositOut: depositOut.toString(),
  });
  const cashReceivedAt = row.payments.find(
    (payment) => payment.purpose === 'DEPOSIT' && payment.direction === 'IN',
  )?.paidAt;
  const cashReturnedAt = [...row.payments]
    .reverse()
    .find((payment) => payment.purpose === 'DEPOSIT_REFUND' && payment.direction === 'OUT')?.paidAt;
  return {
    ...toRentalSummary(row),
    rentalSubtotal: row.rentalSubtotal.toString(),
    chargesTotal: row.chargesTotal.toString(),
    discountTotal: row.discountTotal.toString(),
    depositRequired: row.depositRequired.toString(),
    collateralMethod: row.collateralMethod,
    documentType: row.documentType,
    collateralStatus: row.collateralMethod === 'CASH' ? row.depositStatus : row.collateralStatus,
    collateralReceivedAt:
      row.collateralMethod === 'CASH'
        ? cashReceivedAt
          ? timestamp(cashReceivedAt)
          : null
        : row.collateralReceivedAt
          ? timestamp(row.collateralReceivedAt)
          : null,
    collateralReturnedAt:
      row.collateralMethod === 'CASH'
        ? cashReturnedAt
          ? timestamp(cashReturnedAt)
          : null
        : row.collateralReturnedAt
          ? timestamp(row.collateralReturnedAt)
          : null,
    paidAmount: paidAmount.toString(),
    remainingAmount: remainingAmount.toString(),
    settlement,
    note: row.note,
    internalNote: row.internalNote,
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productNameSnapshot: item.productNameSnapshot,
      variantNameSnapshot: item.variantNameSnapshot,
      quantity: item.quantity,
      status: item.status,
      unitRentalPrice: item.unitRentalPrice.toString(),
      depositAmount: item.depositAmount.toString(),
      lineTotal: item.lineTotal.toString(),
      allocations: item.allocations.map((allocation) => ({
        id: allocation.id,
        inventoryItemId: allocation.inventoryItemId,
        sku: allocation.inventoryItem.sku,
        operationalStatus: allocation.inventoryItem.currentStatus,
        status: allocation.status,
        reservedFrom: timestamp(allocation.reservedFrom),
        reservedUntil: timestamp(allocation.reservedUntil),
        releasedAt: allocation.releasedAt ? timestamp(allocation.releasedAt) : null,
      })),
    })),
    charges: row.charges.map((charge) => ({
      id: charge.id,
      chargeType: charge.chargeType,
      description: charge.description,
      amount: charge.amount.toString(),
      quantity: charge.quantity,
      currency: charge.currency,
    })),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      transactionNumber: payment.transactionNumber,
      direction: payment.direction,
      purpose: payment.purpose,
      paymentMethod: payment.paymentMethod,
      amount: payment.amount.toString(),
      currency: payment.currency,
      paidAt: timestamp(payment.paidAt),
    })),
    deliveries: row.deliveries.map((delivery) => ({
      id: delivery.id,
      direction: delivery.direction,
      method: delivery.method,
      status: delivery.status,
      scheduledAt: delivery.scheduledAt ? timestamp(delivery.scheduledAt) : null,
      recipientName: delivery.recipientName,
      recipientPhone: delivery.recipientPhone,
      addressLine: delivery.addressLine,
      shippingFee: delivery.shippingFee.toString(),
    })),
    statusHistory: row.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      reason: entry.reason,
      changedAt: timestamp(entry.changedAt),
    })),
  };
}
