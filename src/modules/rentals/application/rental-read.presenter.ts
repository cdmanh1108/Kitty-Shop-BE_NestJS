import {
  PUBLIC_MEDIA_URL_RESOLVER,
  type PublicMediaUrlResolver,
} from '@common/storage/public-url.resolver';
import type { JsonSerialized } from '@common/types/json';
import { Inject, Injectable } from '@nestjs/common';
import type { RentalOrderDetails, RentalOrderPage } from '../domain/rental.models';
import {
  calculateRentalPaymentTotals,
  calculateRentalSettlement,
} from '../domain/rental-settlement';
import type { RentalDetailsResult, RentalOrderSummaryResult } from './rental-read.models';

type SummarySource = RentalOrderPage['items'][number] | NonNullable<RentalOrderDetails>;
type DetailsSource = RentalOrderDetails | JsonSerialized<RentalOrderDetails>;
type RentalItemSource =
  | NonNullable<RentalOrderDetails>['items'][number]
  | JsonSerialized<NonNullable<RentalOrderDetails>['items'][number]>;
type MoneyValue = { toString(): string } | string;

function money(value: MoneyValue): string {
  return typeof value === 'string' ? value : value.toString();
}

@Injectable()
export class RentalReadPresenter {
  constructor(
    @Inject(PUBLIC_MEDIA_URL_RESOLVER) private readonly mediaUrls: PublicMediaUrlResolver,
  ) {}

  summary(row: SummarySource | JsonSerialized<SummarySource>): RentalOrderSummaryResult {
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      customerId: row.customerId,
      rentalStartAt: row.rentalStartAt,
      rentalEndAt: row.rentalEndAt,
      status: row.status,
      paymentStatus: row.paymentStatus,
      depositStatus: row.depositStatus,
      grandTotal: money(row.grandTotal),
      itemCount:
        'itemCount' in row
          ? row.itemCount
          : row.items.reduce((sum, item) => sum + item.quantity, 0),
      productCount: 'productCount' in row ? row.productCount : row.items.length,
      customer: { id: row.customer.id, fullName: row.customer.fullName, phone: row.customer.phone },
    };
  }

  details(row: DetailsSource): RentalDetailsResult | null {
    if (!row) return null;
    const summary = this.summary(row);
    const payments = row.payments.map((payment) => ({
      source: payment.source,
      createdBy: payment.createdBy,
      note: payment.note,
      id: payment.id,
      transactionNumber: payment.transactionNumber,
      direction: payment.direction,
      purpose: payment.purpose,
      paymentMethod: payment.paymentMethod,
      amount: money(payment.amount),
      currency: payment.currency,
      paidAt: payment.paidAt,
    }));
    const paymentTotals = calculateRentalPaymentTotals({
      grandTotal: summary.grandTotal,
      payments,
    });
    const cashReceivedAt = payments.find(
      (payment) => payment.purpose === 'DEPOSIT' && payment.direction === 'IN',
    )?.paidAt;
    const cashReturnedAt = [...payments]
      .reverse()
      .find(
        (payment) => payment.purpose === 'DEPOSIT_REFUND' && payment.direction === 'OUT',
      )?.paidAt;

    return {
      ...summary,
      confirmation: row.confirmation
        ? {
            confirmedAt: row.confirmation.confirmedAt,
            confirmedBy: row.confirmation.confirmedBy,
            actorName: row.confirmation.actorName,
            rentalAmount: money(row.confirmation.rentalAmount),
            collateralMethod: row.confirmation.collateralMethod,
            documentType: row.confirmation.documentType,
            collateralAmount: row.confirmation.collateralAmount
              ? money(row.confirmation.collateralAmount)
              : null,
            note: row.confirmation.note,
            hasEvidence: Boolean(row.confirmation.evidenceKey),
            evidenceFilename: row.confirmation.evidenceFilename,
          }
        : null,
      rentalSubtotal: money(row.rentalSubtotal),
      chargesTotal: money(row.chargesTotal),
      discountTotal: money(row.discountTotal),
      depositRequired: money(row.depositRequired),
      collateralMethod: row.collateralMethod,
      documentType: row.documentType,
      collateralStatus: row.confirmation
        ? row.collateralStatus
        : row.collateralMethod === 'CASH'
          ? row.depositStatus
          : row.collateralStatus,
      collateralReceivedAt:
        row.collateralMethod === 'CASH' && !row.confirmation
          ? (cashReceivedAt ?? null)
          : row.collateralReceivedAt,
      collateralReturnedAt:
        row.collateralMethod === 'CASH' && !row.confirmation
          ? (cashReturnedAt ?? null)
          : row.collateralReturnedAt,
      actualReturnedAt: row.actualReturnedAt,
      paidAmount: paymentTotals.paidAmount,
      remainingAmount: paymentTotals.remainingAmount,
      settlement: calculateRentalSettlement({
        status: row.status,
        hasSettlement: Boolean(row.settlement),
        grandTotal: summary.grandTotal,
        paidRental: paymentTotals.paidAmount,
        depositIn: paymentTotals.depositIn,
        depositOut: paymentTotals.depositOut,
      }),
      returnRecord: row.returnRecord
        ? {
            orderId: row.returnRecord.orderId,
            returnedAt: row.returnRecord.returnedAt,
            receivedBy: row.returnRecord.receivedBy,
            actorName: row.returnRecord.actorName,
            lateDays: row.returnRecord.lateDays,
            lateFee: money(row.returnRecord.lateFee),
            additionalRentalFee: money(row.returnRecord.additionalRental),
            note: row.returnRecord.note,
            inspections: row.returnRecord.inspections.map((inspection) => ({
              id: inspection.id,
              inventoryItemId: inspection.inventoryItemId,
              condition: inspection.condition,
              note: inspection.note,
            })),
          }
        : null,
      settlementDetails: row.settlement
        ? {
            orderId: row.settlement.orderId,
            settledAt: row.settlement.settledAt,
            settledBy: row.settlement.settledBy,
            actorName: row.settlement.actorName,
            settlementType: row.settlement.settlementType,
            amount: money(row.settlement.amount),
            depositAmount: money(row.settlement.depositAmount),
            totalCharges: money(row.settlement.totalCharges),
            refundAmount: money(row.settlement.refundAmount),
            amountDue: money(row.settlement.amountDue),
            note: row.settlement.note,
            evidenceKey: row.settlement.evidenceKey,
            evidenceFilename: row.settlement.evidenceFilename,
            evidenceMimeType: row.settlement.evidenceMimeType,
            evidenceSize: row.settlement.evidenceSize,
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
        imageUrl: this.resolveItemImage(item),
        unitRentalPrice: money(item.unitRentalPrice),
        depositAmount: money(item.depositAmount),
        lineTotal: money(item.lineTotal),
        allocations: item.allocations.map((allocation) => ({
          id: allocation.id,
          inventoryItemId: allocation.inventoryItemId,
          sku: allocation.inventoryItem.sku,
          operationalStatus: allocation.inventoryItem.currentStatus,
          status: allocation.status,
          reservedFrom: allocation.reservedFrom,
          reservedUntil: allocation.reservedUntil,
          releasedAt: allocation.releasedAt,
        })),
      })),
      charges: row.charges.map((charge) => ({
        id: charge.id,
        chargeType: charge.chargeType,
        description: charge.description,
        amount: money(charge.amount),
        quantity: charge.quantity,
        currency: charge.currency,
      })),
      payments,
      deliveries: row.deliveries.map((delivery) => ({
        id: delivery.id,
        direction: delivery.direction,
        method: delivery.method,
        status: delivery.status,
        scheduledAt: delivery.scheduledAt,
        recipientName: delivery.recipientName,
        recipientPhone: delivery.recipientPhone,
        addressLine: delivery.addressLine,
        shippingFee: money(delivery.shippingFee),
      })),
      statusHistory: row.statusHistory.map((entry) => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        reason: entry.reason,
        changedAt: entry.changedAt,
      })),
    };
  }

  private resolveItemImage(item: RentalItemSource): string | null {
    if (item.imageUrl && !item.imageUrl.includes('drive.google.com')) return item.imageUrl;
    const media = item.variant?.media?.[0] ?? item.product?.media?.[0];
    if (!media) return item.imageUrl ?? null;
    return media.storageKey
      ? this.mediaUrls.resolve({ ...media, storageKey: media.storageKey })
      : media.url;
  }
}
