import type { Prisma } from '@prisma/client';
import { ALLOCATION_STATUS, BLOCKING_ALLOCATION_STATUSES } from '../domain/rental-status';

/** Rental booking eligibility expressed as a Prisma persistence query. */
export function operationallyRentableInventoryWhere() {
  return {
    isActive: true,
    archivedAt: null,
    currentStatus: 'AVAILABLE',
    variant: {
      archivedAt: null,
      status: 'ACTIVE',
      product: { archivedAt: null, status: 'ACTIVE', isRentable: true },
    },
  } satisfies Prisma.InventoryItemWhereInput;
}

export function unreleasedRentalWhere() {
  return {
    status: ALLOCATION_STATUS.ACTIVE,
    releasedAt: null,
  } satisfies Prisma.RentalItemAllocationWhereInput;
}

/**
 * Query criteria for rentable inventory:
 * 1. Physical operational condition must be AVAILABLE, active, and not archived.
 * 2. No overlapping allocation for the requested half-open [from, until) interval.
 * 3. No unreleased ACTIVE allocation (overdue rentals still block availability).
 *
 * PostgreSQL GiST exclusion constraint remains the final concurrent booking guard.
 */
export function availableInventoryWhere(input: { from: Date; until: Date }) {
  return {
    ...operationallyRentableInventoryWhere(),
    allocations: {
      none: {
        OR: [
          {
            status: { in: [...BLOCKING_ALLOCATION_STATUSES] },
            reservedFrom: { lt: input.until },
            reservedUntil: { gt: input.from },
          },
          unreleasedRentalWhere(),
        ],
      },
    },
  } satisfies Prisma.InventoryItemWhereInput;
}
