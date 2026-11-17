import type { WebCheckoutPaymentPreference } from '../domain/web-payment-preference';
import type { ResolvedRentalCyclePricing } from '../domain/rental-cycle-pricing';
import type { RentalBillingRole, RentalAccessoryAllowance } from '../domain/rental-accessories';

export interface WebAvailabilityQueryInput {
  productId?: string;
  variantId: string;
  pickupDate: string;
  returnDate: string;
}

export interface WebAvailabilityResult {
  available: boolean;
  availableQuantity?: number;
}

export interface WebRentalItemInput {
  variantId: string;
  productId?: string;
  quantity: number;
  billingRole?: RentalBillingRole;
}

export interface WebRentalQuoteInput {
  pickupDate: string;
  returnDate: string;
  items: WebRentalItemInput[];
  deliveryMethod?: 'self_pickup' | 'shop_delivery';
  loyaltyRewardId?: string;
}

export type WebRentalLineIssue = 'NOT_RENTABLE' | 'INSUFFICIENT_QUANTITY' | 'PRICE_UNAVAILABLE';

export interface WebRentalLineAvailability {
  productId?: string;
  variantId?: string;
  billingRole?: RentalBillingRole;
  requestedQuantity: number;
  availableQuantity: number;
  available: boolean;
  issue?: WebRentalLineIssue;
  pricing?: ResolvedRentalCyclePricing;
  unitRentalPrice?: number;
  lineTotal?: number;
  depositAmount?: number;
}

export interface WebRentalQuoteResult {
  durationDays: number;
  pricing: ResolvedRentalCyclePricing | null;
  accessoryAllowance?: RentalAccessoryAllowance;
  rentalSubtotal: number;
  depositAmount: number;
  shippingFee: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  available: boolean;
  canCheckout: boolean;
  loyaltyReward?: {
    id: string;
    rewardValue: number;
    discountAmount: number;
    applicable: boolean;
  };
  items: WebRentalLineAvailability[];
}

export interface WebCreateOrderInput {
  expectedRentalSubtotal?: number;
  customer: {
    name: string;
    phone: string;
    note?: string;
  };
  pickupDate: string;
  returnDate: string;
  items: WebRentalItemInput[];
  delivery: {
    method: 'self_pickup' | 'shop_delivery';
    address?: string;
  };
  paymentMethod: WebCheckoutPaymentPreference;
  loyaltyRewardId?: string;
  collateral?: {
    method?: 'CASH' | 'DOCUMENT';
    documentType?: 'CCCD' | 'GPLX';
  };
}

export interface WebCreateOrderResult {
  orderCode: string;
  totalAmount: number;
  depositAmount: number;
  status: string;
  paymentStatus: string;
}

/** Trusted verified account context, never supplied by a checkout transport DTO. */
export interface WebCheckoutOwnerContext {
  webAccountId: string;
  email: string;
}
