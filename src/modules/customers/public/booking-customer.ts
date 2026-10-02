import type {
  BookingCustomerResolution,
  BookingCustomerResolutionInput,
} from '../domain/customer.repository';

export {
  InvalidCustomerPhoneError,
  normalizeCustomerPhone,
} from '../domain/customer-phone';
export type {
  BookingCustomerResolution,
  BookingCustomerResolutionInput,
} from '../domain/customer.repository';

export const BOOKING_CUSTOMER_RESOLVER = Symbol('BOOKING_CUSTOMER_RESOLVER');

export interface BookingCustomerResolver {
  resolveForBooking(input: BookingCustomerResolutionInput): Promise<BookingCustomerResolution>;
}
