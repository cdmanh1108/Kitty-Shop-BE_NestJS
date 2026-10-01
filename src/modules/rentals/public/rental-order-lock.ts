/**
 * Infrastructure integration contract for writers that share the Rental Order
 * consistency boundary. Callers must pass their active transaction client.
 */
export { lockRentalOrder } from '../infrastructure/rental-order-lock';
