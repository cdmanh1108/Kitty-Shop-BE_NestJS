import type {
  PaymentDirection,
  PaymentPurpose,
  PaymentMethod,
} from '@modules/finance/domain/payment-types';
import type { ExpenseRecord } from '@modules/finance/domain/finance.records';
import type {
  CreatePaymentResult,
  ListExpenseCategoriesResult,
  ListExpensesResult,
  ListPaymentsResult,
  VoidExpenseResult,
} from './finance.models';

export class FinanceInvariantError extends Error {}

export const FINANCE_REPOSITORY = Symbol('FINANCE_REPOSITORY');

export interface FinanceRepository {
  createPayment(input: FinanceCreatePaymentData): Promise<CreatePaymentResult>;
  voidPayment(input: {
    shopId: string;
    paymentId: string;
    voidedBy: string;
  }): Promise<CreatePaymentResult>;
  listPayments(input: FinanceListPaymentsCriteria): Promise<ListPaymentsResult>;
  createExpense(input: FinanceCreateExpenseData): Promise<ExpenseRecord>;
  listExpenses(input: FinanceListExpensesCriteria): Promise<ListExpensesResult>;
  voidExpense(input: { shopId: string; expenseId: string }): Promise<VoidExpenseResult>;
  listExpenseCategories(shopId: string): Promise<ListExpenseCategoriesResult>;
}

export interface FinanceCreatePaymentData {
  shopId: string;
  orderId: string;
  transactionNumber: string;
  direction: PaymentDirection;
  purpose: PaymentPurpose;
  paymentMethod: PaymentMethod;
  amount: number;
  externalReference?: string;
  bankReference?: string;
  note?: string;
  paidAt: Date;
  createdBy: string;
}

export interface FinanceListPaymentsCriteria {
  shopId: string;
  page: number;
  limit: number;
  orderId?: string;
  from?: Date;
  until?: Date;
  purpose?: string;
}

export interface FinanceCreateExpenseData {
  shopId: string;
  expenseNumber: string;
  categoryId: string;
  orderId?: string;
  inventoryItemId?: string;
  description: string;
  amount: number;
  paymentMethod?: string;
  vendorName?: string;
  expenseDate: Date;
  paidAt?: Date;
  receiptUrl?: string;
  createdBy: string;
}

export interface FinanceListExpensesCriteria {
  shopId: string;
  page: number;
  limit: number;
  categoryId?: string;
  from?: Date;
  until?: Date;
  status?: string;
}
