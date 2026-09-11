import type {
  CreateExpenseInput,
  CreatePaymentInput,
  ExpenseListQuery,
  PaymentListQuery,
} from '../application/finance.contracts';
import type {
  CreateExpenseReqDto,
  CreatePaymentReqDto,
  ExpenseListQueryDto,
  PaymentListQueryDto,
} from './finance.dto';

export function toCreateExpenseInput(dto: CreateExpenseReqDto): CreateExpenseInput {
  return { ...dto };
}
export function toCreatePaymentInput(dto: CreatePaymentReqDto): CreatePaymentInput {
  return { ...dto };
}
export function toExpenseListQuery(dto: ExpenseListQueryDto): ExpenseListQuery {
  return { ...dto };
}
export function toPaymentListQuery(dto: PaymentListQueryDto): PaymentListQuery {
  return { ...dto };
}
