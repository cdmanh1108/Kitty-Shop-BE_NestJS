import type { PaginatedResult } from '@common/dto/pagination.query.dto';

export class FinanceInvariantError extends Error {}

export const FINANCE_REPOSITORY = Symbol('FINANCE_REPOSITORY');

export interface FinanceRepository {
  createPayment(input: {
    shopId: string;
    orderId: string;
    transactionNumber: string;
    direction: string;
    purpose: string;
    paymentMethod: string;
    amount: number;
    externalReference?: string;
    bankReference?: string;
    note?: string;
    paidAt: Date;
    createdBy: string;
  }): Promise<unknown | null>;
  voidPayment(input: { shopId: string; paymentId: string; voidedBy: string }): Promise<unknown | null>;
  listPayments(input: { shopId: string; page: number; limit: number; orderId?: string; from?: Date; until?: Date; purpose?: string }): Promise<PaginatedResult<unknown>>;
  createExpense(input: {
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
  }): Promise<unknown>;
  listExpenses(input: { shopId: string; page: number; limit: number; categoryId?: string; from?: Date; until?: Date; status?: string }): Promise<PaginatedResult<unknown>>;
  voidExpense(input: { shopId: string; expenseId: string }): Promise<unknown | null>;
  listExpenseCategories(shopId: string): Promise<unknown[]>;
}
