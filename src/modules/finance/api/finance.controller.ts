import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { FinanceService } from '../application/finance.service';
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

@ApiTags('Finance')
@ApiBearerAuth('access-token')
@Controller()
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Get('payments')
  @Permissions(PERMISSIONS.PAYMENTS_VIEW)
  @ApiOkResponse({ type: PaymentPageResDto })
  listPayments(@CurrentUser() user: CurrentUserType, @Query() query: PaymentListQueryDto) {
    return this.service.listPayments(user, query);
  }

  @Post('rental-orders/:orderId/payments')
  @Permissions(PERMISSIONS.PAYMENTS_CREATE)
  @ApiOperation({ summary: 'Record rental payment, deposit or refund and recompute order payment state' })
  @ApiCreatedResponse({ type: PaymentResDto })
  createPayment(
    @CurrentUser() user: CurrentUserType,
    @Param('orderId') orderId: string,
    @Body() body: CreatePaymentReqDto,
  ) {
    return this.service.createPayment(user, orderId, body);
  }

  @Post('payments/:id/void')
  @Permissions(PERMISSIONS.PAYMENTS_CREATE)
  @ApiOkResponse({ type: PaymentResDto })
  voidPayment(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.voidPayment(user, id);
  }

  @Get('expense-categories')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  expenseCategories(@CurrentUser() user: CurrentUserType) {
    return this.service.listExpenseCategories(user);
  }

  @Get('expenses')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  @ApiOkResponse({ type: ExpensePageResDto })
  listExpenses(@CurrentUser() user: CurrentUserType, @Query() query: ExpenseListQueryDto) {
    return this.service.listExpenses(user, query);
  }

  @Post('expenses')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  @ApiCreatedResponse({ type: ExpenseResDto })
  createExpense(@CurrentUser() user: CurrentUserType, @Body() body: CreateExpenseReqDto) {
    return this.service.createExpense(user, body);
  }

  @Post('expenses/:id/void')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  @ApiOkResponse({ type: ExpenseResDto })
  voidExpense(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.voidExpense(user, id);
  }
}
