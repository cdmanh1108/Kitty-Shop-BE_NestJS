import type { DeliveryJobRecord } from '@modules/deliveries/domain/deliveries.records';

export type DeliveryList = Array<
  DeliveryJobRecord & {
    order: {
      customer: {
        phone: string;
        fullName: string;
      };
      orderNumber: string;
    };
  }
>;

export type DeliveryResult = null | DeliveryJobRecord;

export type DeliveryStatusUpdateResult =
  | { kind: 'UPDATED'; delivery: DeliveryJobRecord; fromStatus: string }
  | { kind: 'NOT_FOUND' }
  | { kind: 'INVALID_TRANSITION' }
  | { kind: 'CONCURRENT_MODIFICATION' };
