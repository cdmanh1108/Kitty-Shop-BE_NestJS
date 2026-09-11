import type { DecimalValue } from '@common/types/decimal';

export interface PaymentTransactionRecord {
  id: string;
  shopId: string;
  orderId: string;
  customerId: string;
  transactionNumber: string;
  direction: string;
  purpose: string;
  paymentMethod: string;
  amount: DecimalValue;
  currency: string;
  status: string;
  externalReference: string | null;
  bankReference: string | null;
  note: string | null;
  paidAt: Date;
  createdBy: string | null;
  createdAt: Date;
  voidedAt: Date | null;
  voidedBy: string | null;
}

export interface ExpenseRecord {
  id: string;
  shopId: string;
  expenseNumber: string;
  categoryId: string;
  orderId: string | null;
  inventoryItemId: string | null;
  description: string;
  amount: DecimalValue;
  currency: string;
  paymentMethod: string | null;
  vendorName: string | null;
  expenseDate: Date;
  paidAt: Date | null;
  receiptUrl: string | null;
  status: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  voidedAt: Date | null;
}

export interface ExpenseCategoryRecord {
  id: string;
  shopId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
}
