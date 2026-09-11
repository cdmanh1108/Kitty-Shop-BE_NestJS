import { INVENTORY_STATUS } from '../domain/catalog-status';
import { ALLOCATION_STATUS } from '@modules/rentals/domain/rental-status';
import type { Prisma } from '@prisma/client';

// Half-open intervals; the database exclusion constraint remains the final booking guard.
export function availableInventoryWhere(input: { from: Date; until: Date }) {
  return {
    isActive: true,
    archivedAt: null,
    currentStatus: {
      notIn: [
        INVENTORY_STATUS.CLEANING,
        INVENTORY_STATUS.REPAIRING,
        INVENTORY_STATUS.DAMAGED,
        INVENTORY_STATUS.LOST,
        INVENTORY_STATUS.RETIRED,
      ],
    },
    allocations: {
      none: {
        status: {
          in: [ALLOCATION_STATUS.HELD, ALLOCATION_STATUS.CONFIRMED, ALLOCATION_STATUS.ACTIVE],
        },
        reservedFrom: { lt: input.until },
        reservedUntil: { gt: input.from },
      },
    },
  } satisfies Prisma.InventoryItemWhereInput;
}
