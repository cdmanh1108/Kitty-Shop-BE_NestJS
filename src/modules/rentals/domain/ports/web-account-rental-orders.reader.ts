import type { RentalStatus } from '../rental-status';

export interface WebAccountRentalOrdersReader {
  listWebAccountOrders(
    input: WebAccountRentalOrderListCriteria,
  ): Promise<WebAccountRentalOrderPage>;
  getWebAccountOrder(
    shopId: string,
    webAccountId: string,
    orderNumber: string,
  ): Promise<WebAccountRentalOrderDetail | null>;
}

export const WEB_ACCOUNT_RENTAL_ORDERS_READER = Symbol('WEB_ACCOUNT_RENTAL_ORDERS_READER');

export interface WebAccountRentalOrderListCriteria {
  shopId: string;
  webAccountId: string;
  page: number;
  limit: number;
  status?: RentalStatus;
}

export interface WebAccountRentalOrderListItem {
  orderCode: string;
  createdAt: Date;
  rentalStartAt: Date;
  rentalEndAt: Date;
  status: string;
  paymentStatus: string;
  depositStatus: string;
  grandTotal: number;
  depositRequired: number;
  preferredPaymentMethod: string | null;
  itemCount: number;
  itemsPreview: Array<{ productName: string; variantName: string; quantity: number }>;
}

export interface WebAccountRentalOrderPage {
  items: WebAccountRentalOrderListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface WebAccountRentalOrderDetail extends WebAccountRentalOrderListItem {
  /** Internal-only aggregate identity; Web response mappers never expose it. */
  id: string;
  rentalSubtotal: number;
  chargesTotal: number;
  discountTotal: number;
  collateralMethod: string;
  documentType: string | null;
  actualReturnedAt: Date | null;
  deliveries: Array<{
    method: string;
    status: string;
    scheduledAt: Date | null;
    recipientName: string | null;
    recipientPhone: string | null;
    addressLine: string | null;
    shippingFee: number;
  }>;
  items: Array<{
    productId: string;
    productName: string;
    variantName: string;
    quantity: number;
    unitRentalPrice: number;
    lineTotal: number;
    depositAmount: number;
  }>;
  timeline: Array<{ status: string; changedAt: Date }>;
}
