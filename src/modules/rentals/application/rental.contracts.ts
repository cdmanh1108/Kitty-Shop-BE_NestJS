import type { PaginationParams } from '@common/types/pagination';
export interface AddRentalChargeInput {
  chargeType: string;
  description?: string;
  amount: number;
  quantity: number;
}

export interface CreateRentalOrderInput {
  customerId: string;
  locationId?: string;
  rentalStartAt: string;
  rentalEndAt: string;
  items: Array<CreateRentalItemInput>;
  charges: Array<RentalChargeInput>;
  discountTotal: number;
  note?: string;
  internalNote?: string;
  delivery?: RentalDeliveryInput;
}

export interface CreateRentalItemInput {
  variantId: string;
  quantity: number;
  inventoryItemIds?: Array<string>;
}

export interface RentalChargeInput {
  chargeType: string;
  description?: string;
  amount: number;
  quantity: number;
}

export interface RentalDeliveryInput {
  direction: string;
  method: string;
  scheduledAt?: string;
  recipientName?: string;
  recipientPhone?: string;
  addressLine?: string;
  ward?: string;
  district?: string;
  city?: string;
  province?: string;
  shippingFee: number;
}

export interface RentalListQuery extends PaginationParams {
  customerId?: string;
  search?: string;
  status?: string;
  paymentStatus?: string;
  from?: string;
  until?: string;
}

export interface RescheduleRentalInput {
  rentalStartAt: string;
  rentalEndAt: string;
}

export interface TransitionRentalInput {
  reason?: string;
}
