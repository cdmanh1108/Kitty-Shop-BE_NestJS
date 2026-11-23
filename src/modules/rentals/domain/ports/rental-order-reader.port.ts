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
}

export const RENTAL_ORDER_READER = Symbol('RENTAL_ORDER_READER');

export const RENTAL_LIST_SORT_FIELDS = [
  'orderNumber',
  'rentalStartAt',
  'rentalEndAt',
  'totalAmount',
  'paymentStatus',
  'status',
] as const;
export const RENTAL_LIST_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export interface RentalListCriteria {
  shopId: string;
  customerId?: string;
  webAccountId?: string;
  page: number;
  limit: number;
  search?: string;
  status?: string;
  paymentStatus?: string;
  from?: Date;
  until?: Date;
  sortBy?: (typeof RENTAL_LIST_SORT_FIELDS)[number];
  sortDirection?: (typeof RENTAL_LIST_SORT_DIRECTIONS)[number];
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
  items?: Array<{
    inventoryItemId: string;
    sku: string;
    productName: string;
    variantTitle: string;
    billingRole: string;
    pricingVersion: string;
    calculatedLateFee: string;
    calculatedAdditionalRentalFee: string;
  }>;
  durationDays?: number;
  actualDurationDays?: number;
  feePreviewToken?: string;
}
