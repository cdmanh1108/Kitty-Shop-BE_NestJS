export const RENTAL_STATUS = {
  DRAFT: 'DRAFT',
  RESERVED: 'RESERVED',
  CONFIRMED: 'CONFIRMED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type RentalStatus = (typeof RENTAL_STATUS)[keyof typeof RENTAL_STATUS];

export const ALLOCATION_STATUS = {
  HELD: 'HELD',
  CONFIRMED: 'CONFIRMED',
  ACTIVE: 'ACTIVE',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
} as const;
export type AllocationStatus = (typeof ALLOCATION_STATUS)[keyof typeof ALLOCATION_STATUS];

// Kept in sync with PostgreSQL rental_item_no_overlap's partial predicate.
export const BLOCKING_ALLOCATION_STATUSES = [
  ALLOCATION_STATUS.HELD,
  ALLOCATION_STATUS.CONFIRMED,
  ALLOCATION_STATUS.ACTIVE,
] as const;

export const RENTAL_ITEM_STATUS = {
  RESERVED: 'RESERVED',
  CONFIRMED: 'CONFIRMED',
  ACTIVE: 'ACTIVE',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
} as const;
export type RentalItemStatus = (typeof RENTAL_ITEM_STATUS)[keyof typeof RENTAL_ITEM_STATUS];
