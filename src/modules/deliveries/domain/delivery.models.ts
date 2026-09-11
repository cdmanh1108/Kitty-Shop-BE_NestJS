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
