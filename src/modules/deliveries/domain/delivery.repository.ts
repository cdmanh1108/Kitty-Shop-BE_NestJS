import type {
  DeliveryDirection,
  DeliveryMethod,
  DeliveryStatus,
} from '@modules/deliveries/domain/delivery-status';
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
  direction: DeliveryDirection;
  method: DeliveryMethod;
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
  status: DeliveryStatus;
  shipperName?: string;
  shipperPhone?: string;
  trackingCode?: string;
}
