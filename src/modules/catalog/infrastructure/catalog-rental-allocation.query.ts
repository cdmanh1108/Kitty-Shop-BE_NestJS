import type { Prisma } from '@prisma/client';
import { BLOCKING_ALLOCATION_STATUSES } from '@modules/rentals/public/rental-status';

/** Rental allocations that prevent Catalog inventory from being changed or archived. */
export function activeOccupyingAllocationWhere() {
  return {
    status: { in: [...BLOCKING_ALLOCATION_STATUSES] },
    releasedAt: null,
  } satisfies Prisma.RentalItemAllocationWhereInput;
}
