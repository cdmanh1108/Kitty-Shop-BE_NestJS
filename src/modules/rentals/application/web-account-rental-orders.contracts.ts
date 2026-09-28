import type { RentalStatus } from '../domain/rental-status';

/** Validated, transport-independent inputs for a signed-in account's rental history. */
export interface WebAccountRentalOrdersQuery {
  page: number;
  limit: number;
  status?: RentalStatus;
}
