import type { WebPaymentPreference } from '../domain/web-payment-preference';

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
}

export interface WebRentalQuoteInput {
  pickupDate: string;
  returnDate: string;
  items: WebRentalItemInput[];
  deliveryMethod?: 'self_pickup' | 'shop_delivery';
}

export interface WebRentalQuoteResult {
  durationDays: number;
  rentalSubtotal: number;
  depositAmount: number;
  shippingFee: number;
  totalAmount: number;
  currency: string;
  available: boolean;
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
  }>;
}
