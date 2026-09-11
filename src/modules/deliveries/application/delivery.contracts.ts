export interface CreateDeliveryInput {
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
  shipperName?: string;
  shipperPhone?: string;
  shippingFee: number;
  trackingCode?: string;
  notes?: string;
}

export interface UpdateDeliveryStatusInput {
  status: string;
  shipperName?: string;
  shipperPhone?: string;
  trackingCode?: string;
}
