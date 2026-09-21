import type { RentalSettlement } from '../domain/rental-settlement';
import type { WebPaymentPreference } from '../domain/web-payment-preference';

export type RentalReadTimestamp = Date | string;

export interface RentalOrderSummaryResult {
  id: string;
  orderNumber: string;
  customerId: string;
  rentalStartAt: RentalReadTimestamp;
  rentalEndAt: RentalReadTimestamp;
  status: string;
  paymentStatus: string;
  depositStatus: string;
  grandTotal: string;
  itemCount: number;
  productCount: number;
  customer: { id: string; fullName: string; phone: string };
}

export interface RentalDetailsResult extends RentalOrderSummaryResult {
  preferredPaymentMethod: WebPaymentPreference | null;
  confirmation: {
    confirmedAt: RentalReadTimestamp;
    confirmedBy: string;
    actorName: string;
    rentalAmount: string;
    collateralMethod: string;
    documentType: string | null;
    collateralAmount: string | null;
    note: string | null;
    hasEvidence: boolean;
    evidenceFilename: string | null;
  } | null;
  rentalSubtotal: string;
  chargesTotal: string;
  discountTotal: string;
  depositRequired: string;
  collateralMethod: string;
  documentType: string | null;
  collateralStatus: string;
  collateralReceivedAt: RentalReadTimestamp | null;
  collateralReturnedAt: RentalReadTimestamp | null;
  actualReturnedAt: RentalReadTimestamp | null;
  paidAmount: string;
  remainingAmount: string;
  settlement: RentalSettlement;
  returnRecord: {
    orderId: string;
    returnedAt: RentalReadTimestamp;
    receivedBy: string;
    actorName: string | null;
    lateDays: number;
    lateFee: string;
    additionalRentalFee: string;
    note: string | null;
    inspections: Array<{
      id: string;
      inventoryItemId: string;
      condition: string;
      note: string | null;
    }>;
  } | null;
  settlementDetails: {
    orderId: string;
    settledAt: RentalReadTimestamp;
    settledBy: string;
    actorName: string | null;
    settlementType: string;
    amount: string;
    depositAmount: string;
    totalCharges: string;
    refundAmount: string;
    amountDue: string;
    note: string | null;
    evidenceKey: string | null;
    evidenceFilename: string | null;
    evidenceMimeType: string | null;
    evidenceSize: number | null;
  } | null;
  note: string | null;
  internalNote: string | null;
  items: Array<{
    id: string;
    productId: string;
    variantId: string;
    productNameSnapshot: string;
    variantNameSnapshot: string;
    quantity: number;
    status: string;
    imageUrl: string | null;
    unitRentalPrice: string;
    depositAmount: string;
    lineTotal: string;
    allocations: Array<{
      id: string;
      inventoryItemId: string;
      sku: string;
      operationalStatus: string;
      status: string;
      reservedFrom: RentalReadTimestamp;
      reservedUntil: RentalReadTimestamp;
      releasedAt: RentalReadTimestamp | null;
    }>;
  }>;
  charges: Array<{
    id: string;
    chargeType: string;
    description: string | null;
    amount: string;
    quantity: number;
    currency: string;
  }>;
  payments: Array<{
    source: string;
    createdBy: string | null;
    note: string | null;
    id: string;
    transactionNumber: string;
    direction: string;
    purpose: string;
    paymentMethod: string;
    amount: string;
    currency: string;
    paidAt: RentalReadTimestamp;
  }>;
  deliveries: Array<{
    id: string;
    direction: string;
    method: string;
    status: string;
    scheduledAt: RentalReadTimestamp | null;
    recipientName: string | null;
    recipientPhone: string | null;
    addressLine: string | null;
    shippingFee: string;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    changedAt: RentalReadTimestamp;
  }>;
}
