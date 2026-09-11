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

export const RENTAL_ITEM_STATUS = {
  RESERVED: 'RESERVED',
  CONFIRMED: 'CONFIRMED',
  ACTIVE: 'ACTIVE',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
} as const;
export type RentalItemStatus = (typeof RENTAL_ITEM_STATUS)[keyof typeof RENTAL_ITEM_STATUS];
