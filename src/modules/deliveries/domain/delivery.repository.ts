import type { PaginationParams } from '@common/types/pagination';
import type {
  DeliveryDirection,
  DeliveryMethod,
  DeliveryStatus,
} from '@modules/deliveries/domain/delivery-status';
import type {
  DeliveryList,
  DeliveryPage,
  DeliveryResult,
  DeliveryStatusUpdateResult,
} from './delivery.models';
export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');
export interface DeliveryRepository {
  list(shopId: string, orderId?: string): Promise<DeliveryList>;
  page(input: DeliveryPageCriteria): Promise<DeliveryPage>;
  get(shopId: string, id: string): Promise<DeliveryList[number] | null>;
  create(input: DeliveryCreateData): Promise<DeliveryResult>;
  updateStatus(input: DeliveryUpdateStatusData): Promise<DeliveryStatusUpdateResult>;
}

export interface DeliveryPageCriteria extends PaginationParams {
  shopId: string;
  orderId?: string;
  search?: string;
  method?: DeliveryMethod;
  status?: DeliveryStatus;
  direction?: DeliveryDirection;
  from?: Date;
  until?: Date;
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
