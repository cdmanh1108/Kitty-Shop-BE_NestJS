import type {
  DeliveryDirection,
  DeliveryMethod,
  DeliveryStatus,
} from '@modules/deliveries/domain/delivery-status';
export interface CreateDeliveryInput {
  direction: DeliveryDirection;
  method: DeliveryMethod;
  scheduledAt?: string;
  recipientName?: string;
  recipientPhone?: string;
  addressLine?: string;
  ward?: string;
  district?: string;
  city?: string;
  province?: string;
  shipperName?: string;
  shipperPhone?: string;
  shippingFee: number;
  trackingCode?: string;
  notes?: string;
}

export interface UpdateDeliveryStatusInput {
  status: DeliveryStatus;
  shipperName?: string;
  shipperPhone?: string;
  trackingCode?: string;
}
