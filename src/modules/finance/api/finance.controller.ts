import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Get, Header, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { FinanceService } from '../application/finance.service';
import type { ExpenseRecord } from '../domain/finance.records';
import { ExpenseCategoryResDto } from './finance-read.dto';
import {
  CreateExpenseReqDto,
  CreatePaymentReqDto,
  ExpenseListQueryDto,
  ExpensePageResDto,
  ExpenseResDto,
  PaymentListQueryDto,
  PaymentPageResDto,
  PaymentResDto,
} from './finance.dto';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import {
  toCreateExpenseInput,
  toCreatePaymentInput,
  toExpenseListQuery,
  toPaymentListQuery,
} from './finance.mapper';

@ApiSurface('admin')
@ApiTags('Finance')
@ApiBearerAuth('access-token')
@Controller('admin')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Get('payments')
  @Permissions(PERMISSIONS.PAYMENTS_VIEW)
  @ApiOkResponse({ type: PaymentPageResDto })
  listPayments(@CurrentUser() user: CurrentUserType, @Query() query: PaymentListQueryDto) {
    return this.service.listPayments(user, toPaymentListQuery(query));
  }

  @Post('rental-orders/:orderId/payments')
  @Header('Cache-Control', 'no-store')
  @Permissions(PERMISSIONS.PAYMENTS_CREATE)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Opaque ASCII key (1-255 characters) created once per manual receipt intent and reused for retries.',
  })
  @ApiOperation({
    summary: 'Record rental payment, deposit or refund and recompute order payment state',
  })
  @ApiCreatedResponse({ type: PaymentResDto })
  @ApiBadRequestResponse({ description: 'Dữ liệu receipt hoặc Idempotency-Key không hợp lệ.' })
  @ApiConflictResponse({
    description: 'Idempotency-Key đang được xử lý hoặc đã dùng cho receipt khác.',
  })
  createPayment(
    @CurrentUser() user: CurrentUserType,
    @Param('orderId') orderId: string,
    @Body() body: CreatePaymentReqDto,
    @Req() request: Request,
  ) {
    const keys = request.rawHeaders
      .filter((_, index) => index % 2 === 0)
      .map((header, index) => ({ header, value: request.rawHeaders[index * 2 + 1] }))
      .filter(({ header }) => header.toLowerCase() === 'idempotency-key')
      .map(({ value }) => value ?? '');
    return this.service.createPayment(
      user,
      orderId,
      toCreatePaymentInput(body),
      keys.length === 0 ? undefined : keys.length === 1 ? keys[0] : keys,
    );
  }

  @Post('payments/:id/void')
  @Permissions(PERMISSIONS.PAYMENTS_CREATE)
  @ApiOkResponse({ type: PaymentResDto })
  voidPayment(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.voidPayment(user, id);
  }

  @Get('expense-categories')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  @ApiOkResponse({ type: [ExpenseCategoryResDto] })
  async expenseCategories(@CurrentUser() user: CurrentUserType) {
    return (await this.service.listExpenseCategories(user)).map(({ id, name }) => ({ id, name }));
  }

  @Get('expenses')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  @ApiOkResponse({ type: ExpensePageResDto })
  listExpenses(@CurrentUser() user: CurrentUserType, @Query() query: ExpenseListQueryDto) {
    return this.service.listExpenses(user, toExpenseListQuery(query));
  }

  @Post('expenses')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  @ApiCreatedResponse({ type: ExpenseResDto })
  async createExpense(@CurrentUser() user: CurrentUserType, @Body() body: CreateExpenseReqDto) {
    return expenseResponse(await this.service.createExpense(user, toCreateExpenseInput(body)));
  }

  @Post('expenses/:id/void')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  @ApiOkResponse({ type: ExpenseResDto })
  voidExpense(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.voidExpense(user, id);
  }
}

function expenseResponse(expense: ExpenseRecord): ExpenseResDto {
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
