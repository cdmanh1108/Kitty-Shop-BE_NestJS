export type PaymentRecordedEvent = {
  shopId: string;
  eventType: 'PAYMENT_RECORDED';
  aggregateType: 'payment_transaction';
  aggregateId: string;
  payload: { paymentId: string; orderId: string };
};
