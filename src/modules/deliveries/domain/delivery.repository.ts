export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');
export interface DeliveryRepository {
  list(shopId: string, orderId?: string): Promise<unknown[]>;
  create(input: {
    shopId: string; orderId: string; direction: string; method: string; scheduledAt?: Date;
    recipientName?: string; recipientPhone?: string; addressLine?: string; ward?: string;
    district?: string; city?: string; province?: string; shipperName?: string; shipperPhone?: string;
    shippingFee: number; trackingCode?: string; notes?: string; createdBy: string;
  }): Promise<unknown | null>;
  updateStatus(input: { shopId: string; id: string; status: string; shipperName?: string; shipperPhone?: string; trackingCode?: string }): Promise<unknown | null>;
}
