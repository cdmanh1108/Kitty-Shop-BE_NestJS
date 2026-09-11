import type {
  PaymentDirection,
  PaymentPurpose,
  PaymentMethod,
} from '@modules/finance/domain/payment-types';
import type { PaginationParams } from '@common/types/pagination';
export interface CreateExpenseInput {
  categoryId: string;
  orderId?: string;
  inventoryItemId?: string;
  description: string;
  amount: number;
  paymentMethod?: string;
  vendorName?: string;
  expenseDate: string;
  paidAt?: string;
  receiptUrl?: string;
}

export interface CreatePaymentInput {
  direction: PaymentDirection;
  purpose: PaymentPurpose;
  paymentMethod: PaymentMethod;
  amount: number;
  externalReference?: string;
  bankReference?: string;
  note?: string;
  paidAt?: string;
}

export interface ExpenseListQuery extends PaginationParams {
  categoryId?: string;
  from?: string;
  until?: string;
  status?: string;
}

export interface PaymentListQuery extends PaginationParams {
  orderId?: string;
  from?: string;
  until?: string;
  purpose?: string;
}
