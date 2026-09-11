import { INVENTORY_STATUS, PRODUCT_STATUS } from '@modules/catalog/domain/catalog-status';
import {
  ALLOCATION_STATUS,
  BLOCKING_ALLOCATION_STATUSES,
} from '@modules/rentals/domain/rental-status';
import type { Prisma } from '@prisma/client';

/**
 * Allocation criteria that actively occupies an inventory item.
 * An allocation blocks manual operational transitions and marks an item occupied if:
 * 1. It is unreleased ACTIVE (even if overdue, it is still physically with the customer).
 * 2. It is HELD or CONFIRMED. Dates never implicitly release a reservation.
 */
export function activeOccupyingAllocationWhere() {
  return {
    status: {
      in: [...BLOCKING_ALLOCATION_STATUSES],
    },
    releasedAt: null,
  } satisfies Prisma.RentalItemAllocationWhereInput;
}

export function operationallyRentableInventoryWhere() {
  return {
    isActive: true,
    archivedAt: null,
    currentStatus: INVENTORY_STATUS.AVAILABLE,
    variant: {
      archivedAt: null,
      status: PRODUCT_STATUS.ACTIVE,
      product: { archivedAt: null, status: PRODUCT_STATUS.ACTIVE, isRentable: true },
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
            status: {
              in: [...BLOCKING_ALLOCATION_STATUSES],
            },
            reservedFrom: { lt: input.until },
            reservedUntil: { gt: input.from },
          },
          unreleasedRentalWhere(),
        ],
      },
    },
  } satisfies Prisma.InventoryItemWhereInput;
}
