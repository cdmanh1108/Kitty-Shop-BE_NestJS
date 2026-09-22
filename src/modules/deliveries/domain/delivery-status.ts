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

/**
 * Normal operational delivery flow. Corrections and retries require an explicit
 * command with their own audit semantics; the status endpoint never moves backward.
 */
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  [DELIVERY_STATUS.PENDING]: [DELIVERY_STATUS.READY, DELIVERY_STATUS.CANCELLED],
  [DELIVERY_STATUS.READY]: [DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.CANCELLED],
  [DELIVERY_STATUS.PICKED_UP]: [
    DELIVERY_STATUS.DELIVERING,
    DELIVERY_STATUS.DELIVERED,
    DELIVERY_STATUS.FAILED,
  ],
  [DELIVERY_STATUS.DELIVERING]: [DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.FAILED],
  [DELIVERY_STATUS.DELIVERED]: [],
  [DELIVERY_STATUS.FAILED]: [],
  [DELIVERY_STATUS.CANCELLED]: [],
};

export function canTransitionDelivery(from: string, to: DeliveryStatus): boolean {
  return DELIVERY_TRANSITIONS[from as DeliveryStatus]?.includes(to) ?? false;
}

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
