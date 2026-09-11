import type { Prisma } from '@prisma/client';

// Half-open intervals; the database exclusion constraint remains the final booking guard.
export function availableInventoryWhere(input: { from: Date; until: Date }) {
  return {
    isActive: true,
    archivedAt: null,
    currentStatus: { notIn: ['CLEANING', 'REPAIRING', 'DAMAGED', 'LOST', 'RETIRED'] },
    allocations: {
      none: {
        status: { in: ['HELD', 'CONFIRMED', 'ACTIVE'] },
        reservedFrom: { lt: input.until },
        reservedUntil: { gt: input.from },
      },
    },
  } satisfies Prisma.InventoryItemWhereInput;
}
