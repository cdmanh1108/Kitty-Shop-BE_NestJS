export type DeliveryCreatedEvent = {
  shopId: string;
  eventType: 'DELIVERY_CREATED';
  aggregateType: 'delivery_job';
  aggregateId: string;
  payload: { deliveryId: string; orderId: string };
};
