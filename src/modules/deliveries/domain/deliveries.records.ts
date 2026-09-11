import type { DecimalValue } from '@common/types/decimal';
import type { JsonValue } from '@common/types/json';

export interface DeliveryJobRecord {
  id: string;
  shopId: string;
  orderId: string;
  direction: string;
  method: string;
  status: string;
  scheduledAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  recipientName: string | null;
  recipientPhone: string | null;
  addressLine: string | null;
  ward: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  shipperName: string | null;
  shipperPhone: string | null;
  shippingFee: DecimalValue;
  trackingCode: string | null;
  notes: string | null;
  metadata: JsonValue | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
