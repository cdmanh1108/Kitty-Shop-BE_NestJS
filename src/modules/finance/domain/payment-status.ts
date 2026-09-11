export const ORDER_PAYMENT_STATUS = {
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUS)[keyof typeof ORDER_PAYMENT_STATUS];

export const DEPOSIT_STATUS = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  PARTIALLY_HELD: 'PARTIALLY_HELD',
  HELD: 'HELD',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
  FORFEITED: 'FORFEITED',
} as const;
export type DepositStatus = (typeof DEPOSIT_STATUS)[keyof typeof DEPOSIT_STATUS];

export const TRANSACTION_STATUS = {
  COMPLETED: 'COMPLETED',
  VOIDED: 'VOIDED',
} as const;
export type TransactionStatus = (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];

export const EXPENSE_STATUS = {
  DRAFT: 'DRAFT',
  PAID: 'PAID',
  VOIDED: 'VOIDED',
} as const;
export type ExpenseStatus = (typeof EXPENSE_STATUS)[keyof typeof EXPENSE_STATUS];
