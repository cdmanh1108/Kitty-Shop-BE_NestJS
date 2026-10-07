import type { JsonValue } from '@common/types/json';
import type { RentalOrderDetails } from '../rental.models';
import type { RentalOrderSource } from '../rental-order-source';
import type { WebPaymentPreference } from '../web-payment-preference';
import type { RentalPricingSnapshot } from '../rental-pricing-snapshot';
import type { RentalBillingRole } from '../rental-accessories';

export type IdempotencyClaim =
  | { state: 'CLAIMED'; claimId: string }
  | { state: 'IN_PROGRESS' }
  | { state: 'HASH_MISMATCH' }
  | { state: 'COMPLETED'; responseBody: JsonValue };

export interface CreateRentalOrderData {
  orderNumber: string;
  shopId: string;
  customerId: string;
  /** Required, trusted creation-channel provenance for every new order. */
  source: RentalOrderSource;
  /** Nullable storefront ownership, resolved from verified server-side Web auth only. */
  webAccountId?: string | null;
  /** Checkout email captured per order; absent for offline/legacy orders. */
  notificationEmail?: string;
  locationId?: string;
  rentalStartAt: Date;
  rentalEndAt: Date;
  discountTotal: number;
  /** Storefront-only preference; it is not an actual payment or receipt method. */
  preferredPaymentMethod?: WebPaymentPreference;
  note?: string;
  internalNote?: string;
  createdBy?: string;
  /** Server-owned context set only by the Web rental application service. */
  storefrontEligibility?: true;
  idempotency?: {
    scope: string;
    key: string;
    claimId: string;
    responseFormat?: 'WEB_RENTAL_ORDER_CREATE_V1';
  };
  lines: Array<{
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    quantity: number;
    billingRole?: RentalBillingRole;
    unitRentalPrice: number;
    depositAmount: number;
    lineTotal: number;
    pricingSnapshot: RentalPricingSnapshot;
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
  collateral?: { method: 'CASH' | 'DOCUMENT'; documentType?: 'CCCD' | 'GPLX' };
}

export interface RentalCreationRepository {
  createOrder(data: CreateRentalOrderData): Promise<RentalOrderDetails>;
  claimIdempotency(input: RentalClaimIdempotencyData): Promise<IdempotencyClaim>;
  releaseIdempotency(shopId: string, scope: string, key: string, claimId: string): Promise<void>;
}

export interface RentalCreationValidator {
  customerExists(shopId: string, customerId: string): Promise<boolean>;
  locationExists(shopId: string, locationId: string): Promise<boolean>;
}

export const RENTAL_CREATION_VALIDATOR = Symbol('RENTAL_CREATION_VALIDATOR');
export const RENTAL_CREATION_REPOSITORY = Symbol('RENTAL_CREATION_REPOSITORY');

export interface RentalClaimIdempotencyData {
  shopId: string;
  scope: string;
  key: string;
  requestHash: string;
  expiresAt: Date;
}
