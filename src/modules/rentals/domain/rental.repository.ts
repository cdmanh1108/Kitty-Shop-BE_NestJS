import type { PaginatedResult } from '@common/dto/pagination.query.dto';

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

export interface IdempotencyClaim {
  state: 'CLAIMED' | 'IN_PROGRESS' | 'COMPLETED' | 'HASH_MISMATCH';
  responseBody?: unknown;
}

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
    pricingSnapshot: object;
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
  getBookableVariant(input: { shopId: string; variantId: string; durationDays: number; from: Date; until: Date }): Promise<BookableVariant | null>;
  createOrder(data: CreateRentalOrderData): Promise<unknown>;
  list(input: { shopId: string; page: number; limit: number; search?: string; status?: string; paymentStatus?: string; from?: Date; until?: Date }): Promise<PaginatedResult<unknown>>;
  get(shopId: string, id: string): Promise<unknown | null>;
  getStatus(shopId: string, id: string): Promise<string | null>;
  getSchedule(shopId: string, id: string): Promise<{ status: string; rentalStartAt: Date; rentalEndAt: Date } | null>;
  transition(input: { shopId: string; orderId: string; fromStatuses: string[]; toStatus: string; changedBy: string; reason?: string }): Promise<unknown | null>;
  reschedule(input: { shopId: string; orderId: string; from: Date; until: Date; changedBy: string }): Promise<unknown | null>;
  addCharge(input: { shopId: string; orderId: string; chargeType: string; description?: string; amount: number; quantity: number; createdBy: string }): Promise<unknown | null>;
  claimIdempotency(input: { shopId: string; scope: string; key: string; requestHash: string; expiresAt: Date }): Promise<IdempotencyClaim>;
  releaseIdempotency(shopId: string, scope: string, key: string): Promise<void>;
}
