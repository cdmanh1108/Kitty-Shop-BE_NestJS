export const PAYMENT_DIRECTION = {
  IN: 'IN',
  OUT: 'OUT',
} as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTION)[keyof typeof PAYMENT_DIRECTION];

export const PAYMENT_PURPOSE = {
  RENTAL_PAYMENT: 'RENTAL_PAYMENT',
  DEPOSIT: 'DEPOSIT',
  LATE_FEE: 'LATE_FEE',
  DAMAGE_FEE: 'DAMAGE_FEE',
  SHIPPING: 'SHIPPING',
  DEPOSIT_REFUND: 'DEPOSIT_REFUND',
  ORDER_REFUND: 'ORDER_REFUND',
  OTHER: 'OTHER',
} as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSE)[keyof typeof PAYMENT_PURPOSE];

export const PAYMENT_METHOD = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  QR: 'QR',
  MOMO: 'MOMO',
  ZALOPAY: 'ZALOPAY',
  CARD: 'CARD',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];
