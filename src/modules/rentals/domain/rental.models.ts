import type { PaginatedResult } from '@common/types/pagination';
import type { RentalConfirmationRecord } from './rental-confirmation';
import type {
  RentalItemAllocationRecord,
  RentalOrderChargeRecord,
  RentalOrderItemRecord,
  RentalOrderRecord,
  RentalOrderStatusHistoryRecord,
} from '@modules/rentals/domain/rentals.records';

import type { RentalReturnRecord, RentalSettlementRecord } from './rental-return';

/** Read projections owned by Rentals; they are intentionally not provider persistence records. */
type RentalCustomerProjection = {
  readonly [key: string]: string | number | boolean | Date | object | null | undefined;
  id: string;
  shopId: string;
  customerCode: string;
  fullName: string;
  phone: string;
};
type RentalLocationProjection = { id: string; code: string; name: string; isPrimary: boolean };
type RentalInventoryProjection = { id: string; sku: string; currentStatus: string };
type RentalPaymentProjection = {
  source: string;
  createdBy: string | null;
  note: string | null;
  id: string;
  transactionNumber: string;
  direction: string;
  purpose: string;
  paymentMethod: string;
  amount: { toString(): string };
  currency: string;
  paidAt: Date;
};
type RentalDeliveryProjection = {
  id: string;
  direction: string;
  method: string;
  status: string;
  scheduledAt: Date | null;
  recipientName: string | null;
  recipientPhone: string | null;
  addressLine: string | null;
  shippingFee: { toString(): string };
};

export type RentalOrderDetails =
  | null
  | (RentalOrderRecord & {
      confirmation: RentalConfirmationRecord | null;
      returnRecord: RentalReturnRecord | null;
      settlement: RentalSettlementRecord | null;
      location: null | RentalLocationProjection;
      statusHistory: Array<RentalOrderStatusHistoryRecord>;
      customer: RentalCustomerProjection;
      items: Array<
        RentalOrderItemRecord & {
          imageUrl?: string | null;
          variant?: {
            media?: Array<{ url: string; storageKey?: string | null }>;
          } | null;
          product?: {
            media?: Array<{ url: string; storageKey?: string | null }>;
          } | null;
          allocations: Array<
            RentalItemAllocationRecord & {
              inventoryItem: RentalInventoryProjection;
            }
          >;
        }
      >;
      charges: Array<RentalOrderChargeRecord>;
      payments: Array<RentalPaymentProjection>;
      deliveries: Array<RentalDeliveryProjection>;
    });

export type RentalOrderPage = PaginatedResult<
  Pick<
    RentalOrderRecord,
    | 'id'
    | 'orderNumber'
    | 'customerId'
    | 'rentalStartAt'
    | 'rentalEndAt'
    | 'status'
    | 'paymentStatus'
    | 'depositStatus'
    | 'grandTotal'
  > & {
    customer: {
      id: string;
      phone: string;
      fullName: string;
    };
    itemCount: number;
    productCount: number;
  }
>;
