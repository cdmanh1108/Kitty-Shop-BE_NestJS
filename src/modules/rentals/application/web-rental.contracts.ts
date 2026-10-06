import type { WebPaymentPreference } from '../domain/web-payment-preference';
import type { ResolvedRentalCyclePricing } from '../domain/rental-cycle-pricing';
import type { RentalBillingRole, RentalAccessoryAllowance } from '../domain/rental-accessories';

export interface WebAvailabilityQueryInput {
  productId?: string;
  variantId?: string;
  pickupDate: string;
  returnDate: string;
}

export interface WebAvailabilityResult {
  available: boolean;
  availableQuantity?: number;
}

export interface WebRentalItemInput {
  variantId?: string;
  productId?: string;
  quantity: number;
  billingRole?: RentalBillingRole;
}

export interface WebRentalQuoteInput {
  pickupDate: string;
  returnDate: string;
  items: WebRentalItemInput[];
  deliveryMethod?: 'self_pickup' | 'shop_delivery';
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
  unitRentalPrice?: number;
  lineTotal?: number;
  depositAmount?: number;
}

export interface WebRentalQuoteResult {
  durationDays: number;
  pricing: ResolvedRentalCyclePricing;
  accessoryAllowance: RentalAccessoryAllowance;
  rentalSubtotal: number;
  depositAmount: number;
  shippingFee: number;
  totalAmount: number;
  currency: string;
  available: boolean;
  canCheckout: boolean;
  items: WebRentalLineAvailability[];
}

export interface WebCreateOrderInput {
  customer: {
    name: string;
    phone: string;
    email?: string;
    facebookOrZalo?: string;
    note?: string;
  };
  pickupDate: string;
  returnDate: string;
  items: WebRentalItemInput[];
  delivery: {
    method: 'self_pickup' | 'shop_delivery';
    address?: string;
  };
  paymentMethod: WebPaymentPreference;
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

/** Trusted request context supplied by optional Web authentication, never a transport DTO. */
export interface WebCheckoutOwnerContext {
  webAccountId: string | null;
}

export interface WebOrderLookupInput {
  orderCode: string;
  phone: string;
}

export interface WebOrderLookupResult {
  orderCode: string;
  customerName: string;
  phoneMasked: string;
  pickupDate: string;
  returnDate: string;
  status: string;
  totalAmount: number;
  depositAmount: number;
  paidAmount: number;
  items: Array<{
    name: string;
    imageUrl: string;
    quantity: number;
    billingRole?: string;
    productKindSnapshot?: string;
  }>;
}
