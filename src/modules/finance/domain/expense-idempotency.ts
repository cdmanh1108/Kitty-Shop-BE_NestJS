import type { JsonValue } from '@common/types/json';
import type { ExpenseRecord } from './finance.records';

export const FINANCE_EXPENSE_IDEMPOTENCY_SCOPE = 'finance.expense.create.v1';
export const FINANCE_EXPENSE_REPLAY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class FinanceExpenseClaimLostError extends Error {
  constructor() {
    super('Quyền xử lý khoản chi đã hết hạn hoặc được thay thế.');
  }
}

export type ExpenseCreateResult = {
  id: string;
  expenseNumber: string;
  categoryId: string;
  description: string;
  amount: string;
  status: string;
  expenseDate: string;
};

type StoredExpenseCreateResult = {
  version: 1;
  kind: 'finance-expense-create';
  result: ExpenseCreateResult;
};

export function toExpenseCreateResult(expense: ExpenseRecord): ExpenseCreateResult {
  return {
    id: expense.id,
    expenseNumber: expense.expenseNumber,
    categoryId: expense.categoryId,
    description: expense.description,
    amount: expense.amount.toString(),
    status: expense.status,
    expenseDate: expense.expenseDate.toISOString().slice(0, 10),
  };
}

export function toStoredExpenseCreateResult(expense: ExpenseRecord): StoredExpenseCreateResult {
  return { version: 1, kind: 'finance-expense-create', result: toExpenseCreateResult(expense) };
}

export function isStoredExpenseCreateResult(value: JsonValue): value is StoredExpenseCreateResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value.result;
  return (
    value.version === 1 &&
    value.kind === 'finance-expense-create' &&
    !!result &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    ['id', 'expenseNumber', 'categoryId', 'description', 'amount', 'status', 'expenseDate'].every(
      (key) => typeof result[key] === 'string' && result[key].length > 0,
    )
  );
}
