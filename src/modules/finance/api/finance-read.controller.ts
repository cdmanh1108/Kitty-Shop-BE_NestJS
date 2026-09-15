import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { CurrentUser as Principal } from '@common/types/current-user';
import { Permissions } from '@common/decorators/permissions.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import { FinanceReadService } from '../application/finance-read.service';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import {
  FinanceFilterDto,
  FinanceSummaryResDto,
  FinanceTransactionsQueryDto,
  FinanceTransactionsResDto,
} from './finance-read.dto';

@ApiSurface('admin')
@ApiTags('Finance')
@ApiBearerAuth('access-token')
@Controller('finance')
export class FinanceReadController {
  constructor(private readonly service: FinanceReadService) {}
  @ApiOperation({
    summary: 'Recognized revenue of completed rentals minus paid operating expenses',
    description:
      'Shop-local inclusive date bounds. Excludes deposits and settlement receipts. Money uses canonical VND decimal strings. See docs/FINANCE.md.',
  })
  @Get('summary')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  @ApiOkResponse({ type: FinanceSummaryResDto })
  summary(
    @CurrentUser() user: Principal,
    @Query() query: FinanceFilterDto,
  ): Promise<FinanceSummaryResDto> {
    return this.service.summary(user, {
      preset: query.preset,
      from: query.from,
      to: query.to,
      direction: query.direction,
      category: query.category,
    });
  }
  @ApiOperation({
    summary: 'Paginated normalized finance entries',
    description:
      'Filters apply before pagination; stable source-prefixed IDs. Same recognition source as summary.',
  })
  @Get('transactions')
  @Permissions(PERMISSIONS.FINANCE_VIEW)
  @ApiOkResponse({ type: FinanceTransactionsResDto })
  transactions(
    @CurrentUser() user: Principal,
    @Query() query: FinanceTransactionsQueryDto,
  ): Promise<FinanceTransactionsResDto> {
    return this.service.transactions(user, {
      preset: query.preset,
      from: query.from,
      to: query.to,
      direction: query.direction,
      category: query.category,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
  }
}
