import {
  DELIVERY_STATUS,
  canTransitionDelivery,
} from '../../src/modules/deliveries/domain/delivery-status';

describe('delivery status transition policy', () => {
  const allowed: Readonly<Record<string, readonly string[]>> = {
    PENDING: ['READY', 'CANCELLED'],
    READY: ['PICKED_UP', 'CANCELLED'],
    PICKED_UP: ['DELIVERING', 'DELIVERED', 'FAILED'],
    DELIVERING: ['DELIVERED', 'FAILED'],
    DELIVERED: [],
    FAILED: [],
    CANCELLED: [],
  };
  const statuses = Object.values(DELIVERY_STATUS);

  it.each(statuses.flatMap((from) => statuses.map((to) => [from, to] as const)))(
    'allows %s -> %s only when the operational matrix permits it',
    (from, to) => {
      expect(canTransitionDelivery(from, to)).toBe(allowed[from]?.includes(to) ?? false);
    },
  );

  it('keeps terminal states and same-status requests outside the normal transition command', () => {
    for (const status of statuses) {
      expect(canTransitionDelivery(DELIVERY_STATUS.DELIVERED, status)).toBe(false);
      expect(canTransitionDelivery(DELIVERY_STATUS.CANCELLED, status)).toBe(false);
      expect(canTransitionDelivery(status, status)).toBe(false);
    }
  });
});
