import type { JsonSerialized } from '@common/types/json';
import type { RentalOrderDetails, RentalOrderPage } from '../domain/rental.models';
import type { RentalOrderListItemResDto, RentalOrderResDto } from './rental.dto';

function timestamp(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

type Summary = RentalOrderPage['items'][number];

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
    customer: { id: row.customer.id, fullName: row.customer.fullName, phone: row.customer.phone },
    items: row.items.map((item) => ({
      id: item.id,
      productNameSnapshot: item.productNameSnapshot,
      variantNameSnapshot: item.variantNameSnapshot,
      quantity: item.quantity,
    })),
  };
}

/** An explicit allowlist also applies to replayed idempotency responses. */
export function toRentalResponse(
  row: RentalOrderDetails | JsonSerialized<RentalOrderDetails>,
): RentalOrderResDto | null {
  if (!row) return null;
  return {
    ...toRentalSummary(row),
    rentalSubtotal: row.rentalSubtotal.toString(),
    chargesTotal: row.chargesTotal.toString(),
    discountTotal: row.discountTotal.toString(),
    depositRequired: row.depositRequired.toString(),
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
