export interface RentalSettlementFeeOverride {
  inventoryItemId: string;
  amount: number;
  reason: string;
}
export interface RentalSettlementPreview {
  feePreviewToken: string;
  grandTotal: string;
  totalCharges: string;
  depositReceived: string;
  depositAvailable: string;
  refundAmount: string;
  amountDue: string;
  items: Array<{
    inventoryItemId: string;
    sku: string;
    productName: string;
    billingRole: string;
    canOverride: boolean;
    calculatedFee: string | null;
    currentFee: string | null;
    agreedFee: string | null;
    feeOverrideReason: string | null;
  }>;
}
export interface RentalSettlementPreviewReader {
  getSettlementPreview(input: {
    shopId: string;
    orderId: string;
    feeOverrides?: RentalSettlementFeeOverride[];
  }): Promise<RentalSettlementPreview | null>;
}
export const RENTAL_SETTLEMENT_PREVIEW_READER = Symbol('RENTAL_SETTLEMENT_PREVIEW_READER');
