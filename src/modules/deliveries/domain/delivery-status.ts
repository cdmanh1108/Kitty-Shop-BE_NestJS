export const DELIVERY_STATUS = {
  PENDING: 'PENDING',
  READY: 'READY',
  PICKED_UP: 'PICKED_UP',
  DELIVERING: 'DELIVERING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type DeliveryStatus = (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];

export const DELIVERY_DIRECTION = {
  OUTBOUND: 'OUTBOUND',
  RETURN: 'RETURN',
} as const;
export type DeliveryDirection = (typeof DELIVERY_DIRECTION)[keyof typeof DELIVERY_DIRECTION];

export const DELIVERY_METHOD = {
  CUSTOMER_PICKUP: 'CUSTOMER_PICKUP',
  SHOP_DELIVERY: 'SHOP_DELIVERY',
  THIRD_PARTY_SHIPPER: 'THIRD_PARTY_SHIPPER',
} as const;
export type DeliveryMethod = (typeof DELIVERY_METHOD)[keyof typeof DELIVERY_METHOD];
