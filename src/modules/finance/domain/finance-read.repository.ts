import type { PaginatedResult } from '@common/types/pagination';

export const FINANCE_READ_REPOSITORY = Symbol('FINANCE_READ_REPOSITORY');
export const FINANCE_CATEGORIES = [
  'RENTAL',
  'ACCESSORY',
  'LATE',
  'CLEANING_DAMAGE',
  'SHIPPING',
  'OTHER',
  'REFUND',
  'EXPENSE',
] as const;
export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];
export interface FinanceFilter {
  preset?: 'today' | 'week' | 'month' | 'custom';
  from?: string;
  to?: string;
  direction?: 'INCOME' | 'EXPENSE';
  category?: FinanceCategory;
}
export interface FinanceRange {
  from: string;
  to: string;
  timezone: string;
}
export interface FinanceCriteria {
  shopId: string;
  start: Date;
  end: Date;
  period: FinanceRange;
  direction?: FinanceFilter['direction'];
  category?: FinanceCategory;
}
export interface FinanceSummary {
  period: FinanceRange;
  totalRevenue: string;
  totalExpenses: string;
  profit: string;
  breakdown: Array<{ category: FinanceCategory; amount: string }>;
}
export interface FinanceTransaction {
  id: string;
  code: string;
  occurredAt: string;
  direction: 'INCOME' | 'EXPENSE';
  category: FinanceCategory;
  description: string;
  amount: string;
  orderId: string | null;
  orderCode: string | null;
}
export interface FinanceReadRepository {
  timezone(shopId: string): Promise<string>;
  summary(input: FinanceCriteria): Promise<Omit<FinanceSummary, 'period'>>;
  transactions(
    input: FinanceCriteria & { page: number; limit: number; sort: 'newest' | 'oldest' },
  ): Promise<PaginatedResult<FinanceTransaction>>;
}
