export const PRODUCT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

/**
 * Operational condition of physical inventory items.
 * Rental occupancy (HELD, CONFIRMED, ACTIVE, RETURNED, CANCELLED) is tracked
 * exclusively by RentalItemAllocation and RentalOrder.
 */
export const INVENTORY_STATUS = {
  AVAILABLE: 'AVAILABLE',
  CLEANING: 'CLEANING',
  REPAIRING: 'REPAIRING',
  DAMAGED: 'DAMAGED',
  LOST: 'LOST',
  RETIRED: 'RETIRED',
} as const;
export type InventoryStatus = (typeof INVENTORY_STATUS)[keyof typeof INVENTORY_STATUS];
