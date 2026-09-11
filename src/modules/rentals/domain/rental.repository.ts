import type { JsonSerialized } from '@common/types/json';
import type { RentalOrderDetails, RentalOrderPage } from './rental.models';

export class RentalOverlapError extends Error {
  constructor() {
    super('One or more inventory items are no longer available for the selected period');
  }
}

export interface BookableVariant {
  id: string;
  variantCode: string;
  productId: string;
  productName: string;
  sizeName: string | null;
  colorName: string | null;
  depositPerItem: number;
  ratePrice: number | null;
  availableInventory: Array<{ id: string; sku: string }>;
}

export type IdempotencyClaim =
  | { state: 'CLAIMED' | 'IN_PROGRESS' | 'HASH_MISMATCH' }
  | { state: 'COMPLETED'; responseBody: JsonSerialized<RentalOrderDetails> };

export interface CreateRentalOrderData {
  orderNumber: string;
  shopId: string;
  customerId: string;
  locationId?: string;
  rentalStartAt: Date;
  rentalEndAt: Date;
  discountTotal: number;
  note?: string;
  internalNote?: string;
  createdBy: string;
  idempotency?: { scope: string; key: string };
  lines: Array<{
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    quantity: number;
    unitRentalPrice: number;
    depositAmount: number;
    lineTotal: number;
    pricingSnapshot: { durationDays: number; unitRentalPrice: number; depositPerItem: number };
    inventory: Array<{ id: string; sku: string }>;
  }>;
  charges: Array<{ chargeType: string; description?: string; amount: number; quantity: number }>;
  delivery?: {
    direction: string;
    method: string;
    scheduledAt?: Date;
    recipientName?: string;
    recipientPhone?: string;
    addressLine?: string;
    ward?: string;
    district?: string;
    city?: string;
    province?: string;
    shippingFee: number;
  };
}

export const RENTAL_REPOSITORY = Symbol('RENTAL_REPOSITORY');

export interface RentalRepository {
  customerExists(shopId: string, customerId: string): Promise<boolean>;
  locationExists(shopId: string, locationId: string): Promise<boolean>;
  getBookableVariant(input: RentalGetBookableVariantData): Promise<BookableVariant | null>;
  createOrder(data: CreateRentalOrderData): Promise<RentalOrderDetails>;
  list(input: RentalListCriteria): Promise<RentalOrderPage>;
  get(shopId: string, id: string): Promise<RentalOrderDetails>;
  getStatus(shopId: string, id: string): Promise<string | null>;
  getSchedule(
    shopId: string,
    id: string,
  ): Promise<{ status: string; rentalStartAt: Date; rentalEndAt: Date } | null>;
  transition(input: RentalTransitionData): Promise<RentalOrderDetails>;
  reschedule(input: RentalRescheduleData): Promise<RentalOrderDetails>;
  addCharge(input: RentalAddChargeData): Promise<RentalOrderDetails>;
  claimIdempotency(input: RentalClaimIdempotencyData): Promise<IdempotencyClaim>;
  releaseIdempotency(shopId: string, scope: string, key: string): Promise<void>;
}

export interface RentalGetBookableVariantData {
  shopId: string;
  variantId: string;
  durationDays: number;
  from: Date;
  until: Date;
}

export interface RentalListCriteria {
  shopId: string;
  page: number;
  limit: number;
  search?: string;
  status?: string;
  paymentStatus?: string;
  from?: Date;
  until?: Date;
}

export interface RentalTransitionData {
  shopId: string;
  orderId: string;
  fromStatuses: string[];
  toStatus: string;
  changedBy: string;
  reason?: string;
}

export interface RentalRescheduleData {
  shopId: string;
  orderId: string;
  from: Date;
  until: Date;
  changedBy: string;
}

export interface RentalAddChargeData {
  shopId: string;
  orderId: string;
  chargeType: string;
  description?: string;
  amount: number;
  quantity: number;
  createdBy: string;
}

export interface RentalClaimIdempotencyData {
  shopId: string;
  scope: string;
  key: string;
  requestHash: string;
  expiresAt: Date;
}
