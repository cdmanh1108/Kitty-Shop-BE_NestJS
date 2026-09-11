export const CHARGE_TYPE = {
  RENTAL_EXTRA: 'RENTAL_EXTRA',
  ACCESSORY: 'ACCESSORY',
  SHIPPING: 'SHIPPING',
  LATE: 'LATE',
  CLEANING: 'CLEANING',
  DAMAGE: 'DAMAGE',
  LOST_ITEM: 'LOST_ITEM',
  OTHER: 'OTHER',
} as const;
export type ChargeType = (typeof CHARGE_TYPE)[keyof typeof CHARGE_TYPE];
