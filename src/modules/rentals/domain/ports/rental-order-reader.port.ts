import type { RentalOrderDetails, RentalOrderPage } from '../rental.models';

export interface RentalOrderReader {
  list(input: RentalListCriteria): Promise<RentalOrderPage>;
  get(shopId: string, id: string): Promise<RentalOrderDetails>;
  getStatus(shopId: string, id: string): Promise<string | null>;
  getSchedule(
    shopId: string,
    id: string,
  ): Promise<{ status: string; rentalStartAt: Date; rentalEndAt: Date } | null>;
  getReturnPreview(shopId: string, orderId: string, returnedAt?: Date): Promise<ReturnPreviewData>;
  lookupStorefrontOrder(
    shopId: string,
    orderNumber: string,
  ): Promise<StorefrontOrderLookupRecord | null>;
}

export const RENTAL_ORDER_READER = Symbol('RENTAL_ORDER_READER');

export interface RentalListCriteria {
  shopId: string;
  customerId?: string;
  page: number;
  limit: number;
  search?: string;
  status?: string;
  paymentStatus?: string;
  from?: Date;
  until?: Date;
}

export interface ReturnPreviewData {
  dueAt: Date;
  actualReturnedAt: Date;
  lateDays: number;
  dailyLateFeePerSet: number;
  lateFee: string;
  additionalRental: string;
  itemCount: number;
  rentalSubtotal: string;
  depositHeld: string;
  collateralMethod: string;
  documentType: string | null;
}

export interface StorefrontOrderLookupRecord {
  orderNumber: string;
  customerFullName: string;
  customerPhone: string;
  customerNormalizedPhone: string;
  rentalStartAt: Date;
  rentalEndAt: Date;
  status: string;
  grandTotal: number;
  depositRequired: number;
  paidAmount: number;
  items: Array<{ name: string; imageUrl: string; quantity: number }>;
}
