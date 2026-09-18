import type {
  RentalDetailsResult,
  RentalOrderSummaryResult,
} from '../application/rental-read.models';
import type { RentalOrderListItemResDto, RentalOrderResDto } from './rental.dto';

function timestamp(value: Date | string): string {
  return typeof value === 'string' ? value : value.toISOString();
}

export function toRentalSummary(row: RentalOrderSummaryResult): RentalOrderListItemResDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    rentalStartAt: timestamp(row.rentalStartAt),
    rentalEndAt: timestamp(row.rentalEndAt),
    status: row.status,
    paymentStatus: row.paymentStatus,
    depositStatus: row.depositStatus,
    grandTotal: row.grandTotal,
    itemCount: row.itemCount,
    productCount: row.productCount,
    customer: { ...row.customer },
  };
}

/** An explicit allowlist also applies to replayed idempotency responses. */
export function toRentalResponse(row: RentalDetailsResult | null): RentalOrderResDto | null {
  if (!row) return null;
  return {
    ...toRentalSummary(row),
    confirmation: row.confirmation
      ? {
          confirmedAt: timestamp(row.confirmation.confirmedAt),
          confirmedBy: row.confirmation.confirmedBy,
          actorName: row.confirmation.actorName,
          rentalAmount: row.confirmation.rentalAmount,
          collateralMethod: row.confirmation.collateralMethod,
          documentType: row.confirmation.documentType,
          collateralAmount: row.confirmation.collateralAmount,
          note: row.confirmation.note,
          hasEvidence: row.confirmation.hasEvidence,
          evidenceFilename: row.confirmation.evidenceFilename,
        }
      : null,
    rentalSubtotal: row.rentalSubtotal,
    chargesTotal: row.chargesTotal,
    discountTotal: row.discountTotal,
    depositRequired: row.depositRequired,
    collateralMethod: row.collateralMethod,
    documentType: row.documentType,
    collateralStatus: row.collateralStatus,
    collateralReceivedAt: row.collateralReceivedAt ? timestamp(row.collateralReceivedAt) : null,
    collateralReturnedAt: row.collateralReturnedAt ? timestamp(row.collateralReturnedAt) : null,
    actualReturnedAt: row.actualReturnedAt ? timestamp(row.actualReturnedAt) : null,
    paidAmount: row.paidAmount,
    remainingAmount: row.remainingAmount,
    settlement: { ...row.settlement },
    returnRecord: row.returnRecord
      ? {
          orderId: row.returnRecord.orderId,
          returnedAt: timestamp(row.returnRecord.returnedAt),
          receivedBy: row.returnRecord.receivedBy,
          actorName: row.returnRecord.actorName,
          lateDays: row.returnRecord.lateDays,
          lateFee: row.returnRecord.lateFee,
          additionalRentalFee: row.returnRecord.additionalRentalFee,
          note: row.returnRecord.note,
          inspections: row.returnRecord.inspections.map((inspection) => ({ ...inspection })),
        }
      : null,
    settlementDetails: row.settlementDetails
      ? {
          ...row.settlementDetails,
          settledAt: timestamp(row.settlementDetails.settledAt),
        }
      : null,
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
      imageUrl: item.imageUrl,
      unitRentalPrice: item.unitRentalPrice,
      depositAmount: item.depositAmount,
      lineTotal: item.lineTotal,
      allocations: item.allocations.map((allocation) => ({
        ...allocation,
        reservedFrom: timestamp(allocation.reservedFrom),
        reservedUntil: timestamp(allocation.reservedUntil),
        releasedAt: allocation.releasedAt ? timestamp(allocation.releasedAt) : null,
      })),
    })),
    charges: row.charges.map((charge) => ({ ...charge })),
    payments: row.payments.map((payment) => ({ ...payment, paidAt: timestamp(payment.paidAt) })),
    deliveries: row.deliveries.map((delivery) => ({
      ...delivery,
      scheduledAt: delivery.scheduledAt ? timestamp(delivery.scheduledAt) : null,
    })),
    statusHistory: row.statusHistory.map((entry) => ({
      ...entry,
      changedAt: timestamp(entry.changedAt),
    })),
  };
}
