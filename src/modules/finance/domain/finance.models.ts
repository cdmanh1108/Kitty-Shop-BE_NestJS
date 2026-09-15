import type { PaginatedResult } from '@common/types/pagination';
import type {
  ExpenseCategoryRecord,
  ExpenseRecord,
  PaymentTransactionRecord,
} from '@modules/finance/domain/finance.records';

export type CreatePaymentResult = null | PaymentTransactionRecord;

export type ListPaymentsResult = PaginatedResult<
  PaymentTransactionRecord & {
    customer: {
      phone: string;
      fullName: string;
    };
    order: {
      orderNumber: string;
    };
  }
>;

export type ListExpensesResult = PaginatedResult<
  ExpenseRecord & {
    category: ExpenseCategoryRecord;
  }
>;

export type VoidExpenseResult = null | ExpenseRecord;

export type ListExpenseCategoriesResult = Array<Pick<ExpenseCategoryRecord, 'id' | 'name'>>;
