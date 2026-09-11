import type { DeliveryList, DeliveryResult } from './delivery.models';
export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');
export interface DeliveryRepository {
  list(shopId: string, orderId?: string): Promise<DeliveryList>;
  create(input: DeliveryCreateData): Promise<DeliveryResult>;
  updateStatus(input: DeliveryUpdateStatusData): Promise<DeliveryResult>;
}

export interface DeliveryCreateData {
  shopId: string;
  orderId: string;
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
  shipperName?: string;
  shipperPhone?: string;
  shippingFee: number;
  trackingCode?: string;
  notes?: string;
  createdBy: string;
}

export interface DeliveryUpdateStatusData {
  shopId: string;
  id: string;
  status: string;
  shipperName?: string;
  shipperPhone?: string;
  trackingCode?: string;
}
