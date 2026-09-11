import type { RentalStatus } from './rental-status';

type RentalEventIdentity = { shopId: string; aggregateType: 'rental_order'; aggregateId: string };
export type RentalOutboxEvent = RentalEventIdentity &
  (
    | { eventType: 'RENTAL_ORDER_CREATED'; payload: { orderId: string } }
    | {
        eventType: 'RENTAL_ORDER_RESCHEDULED';
        payload: { orderId: string; rentalStartAt: string; rentalEndAt: string };
      }
    | {
        eventType: `RENTAL_ORDER_${RentalStatus}`;
        payload: { orderId: string; fromStatus: string; toStatus: RentalStatus };
      }
  );
